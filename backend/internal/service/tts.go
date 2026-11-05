package service

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Text to speech for listening lessons, dictation lines and notebook words (Azure neural TTS,
// REST). The output format has a constant bit rate (48 kbit/s, 24 kHz mono MP3: 144-byte
// frames of 24 ms), so the length of a clip in seconds is bytes / 6000 and clips can be joined
// by appending their bytes.

// TTSFormat is the Azure output format of every clip.
const TTSFormat = "audio-24khz-48kbitrate-mono-mp3"

// TTSBytesPerSecond is the byte rate of TTSFormat.
const TTSBytesPerSecond = 48_000 / 8

// Voices used for AI lessons (Azure neural, US and UK English), by gender.
var (
	TTSVoicesFemale = []string{"en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural", "en-GB-SoniaNeural", "en-US-JennyNeural"}
	TTSVoicesMale   = []string{"en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural", "en-GB-RyanNeural", "en-US-GuyNeural"}
)

// TTSDefaultVoice reads words, examples and dictation lines.
const TTSDefaultVoice = "en-US-AvaMultilingualNeural"

// TTS turns text into an MP3 clip (TTSFormat). slow reads at 75 % speed.
type TTS interface {
	Synthesize(ctx context.Context, text, voice string, slow bool) ([]byte, error)
}

// AzureTTS calls the Azure Speech text-to-speech REST API.
type AzureTTS struct {
	key, region string
	endpoint    string // empty = the regional endpoint; tests point it at a fake server
	client      *http.Client
	sem         chan struct{}
}

func NewAzureTTS(key, region string, concurrency int) *AzureTTS {
	if concurrency < 1 {
		concurrency = 1
	}
	return &AzureTTS{key: key, region: region, client: &http.Client{Timeout: 60 * time.Second}, sem: make(chan struct{}, concurrency)}
}

var xmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")

func xmlEscape(s string) string { return xmlEscaper.Replace(s) }

// SSML builds the request body for one clip.
func SSML(text, voice string, slow bool) string {
	lang := "en-US"
	if strings.HasPrefix(voice, "en-GB") {
		lang = "en-GB"
	}
	body := xmlEscape(strings.TrimSpace(text))
	if slow {
		body = `<prosody rate="-25%">` + body + `</prosody>`
	}
	return fmt.Sprintf(`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="%s"><voice name="%s">%s</voice></speak>`, lang, xmlEscape(voice), body)
}

func (a *AzureTTS) Synthesize(ctx context.Context, text, voice string, slow bool) ([]byte, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errors.New("tts: empty text")
	}
	if voice == "" {
		voice = TTSDefaultVoice
	}
	select {
	case a.sem <- struct{}{}:
		defer func() { <-a.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	url := a.endpoint
	if url == "" {
		url = fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", a.region)
	}
	var lastErr error
	for try := 0; try < 3; try++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(SSML(text, voice, slow)))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Ocp-Apim-Subscription-Key", a.key)
		req.Header.Set("Content-Type", "application/ssml+xml")
		req.Header.Set("X-Microsoft-OutputFormat", TTSFormat)
		req.Header.Set("User-Agent", "speakup")
		res, err := a.client.Do(req)
		if err != nil {
			lastErr = err
		} else {
			data, rerr := io.ReadAll(res.Body)
			res.Body.Close()
			switch {
			case rerr != nil:
				lastErr = rerr
			case res.StatusCode == http.StatusOK && len(data) > 0:
				return data, nil
			case res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500:
				lastErr = fmt.Errorf("tts: azure status %d", res.StatusCode)
			default:
				return nil, fmt.Errorf("tts: azure status %d", res.StatusCode)
			}
		}
		select { // the free tier allows 20 requests a minute: wait and try again
		case <-time.After(time.Duration(3*(try+1)) * time.Second):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}

// TTSCache keeps clips on disk (dir/tts/<hash>.mp3) so a text is synthesized once.
type TTSCache struct {
	tts TTS
	dir string // the audio storage dir
}

func NewTTSCache(tts TTS, dir string) *TTSCache { return &TTSCache{tts: tts, dir: dir} }

// MaxTTSChars is the longest text the cache will read (a word, an example or a line).
const MaxTTSChars = 300

// Path returns the file of the clip (relative to the audio storage), making it when missing.
func (c *TTSCache) Path(ctx context.Context, text, voice string, slow bool) (string, error) {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" || len([]rune(text)) > MaxTTSChars {
		return "", fmt.Errorf("tts: text must be 1-%d characters", MaxTTSChars)
	}
	if voice == "" {
		voice = TTSDefaultVoice
	}
	sum := sha1.Sum([]byte(fmt.Sprintf("%s|%v|%s", voice, slow, text)))
	rel := filepath.Join("tts", hex.EncodeToString(sum[:])+".mp3")
	full := filepath.Join(c.dir, rel)
	if st, err := os.Stat(full); err == nil && st.Size() > 0 {
		return rel, nil
	}
	data, err := c.tts.Synthesize(ctx, text, voice, slow)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", err
	}
	tmp := full + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", err
	}
	return rel, os.Rename(tmp, full)
}

// Full returns the absolute path of a file under the audio storage.
func (c *TTSCache) Full(rel string) string { return filepath.Join(c.dir, rel) }
