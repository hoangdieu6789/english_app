package service

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
)

// Mailer sends plain-text e-mail (password reset links).
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// SMTPMailer sends through an SMTP server (e.g. port 587 with STARTTLS; net/smtp upgrades
// when the server offers it and refuses PLAIN auth without TLS except on localhost).
type SMTPMailer struct {
	addr     string // host:port
	host     string
	username string
	password string
	from     string
}

func NewSMTPMailer(host string, port int, username, password, from string) *SMTPMailer {
	return &SMTPMailer{addr: fmt.Sprintf("%s:%d", host, port), host: host, username: username, password: password, from: from}
}

func (m *SMTPMailer) Send(_ context.Context, to, subject, body string) error {
	var auth smtp.Auth
	if m.username != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.host)
	}
	msg := strings.Join([]string{
		"From: " + m.from,
		"To: " + to,
		"Subject: " + subject,
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	return smtp.SendMail(m.addr, auth, m.from, []string{to}, []byte(msg))
}

// LogMailer writes the e-mail to the API log instead of sending it: for local use when no
// SMTP server is configured. Do not use it on a server other people can reach.
type LogMailer struct{}

func (LogMailer) Send(_ context.Context, to, subject, body string) error {
	log.Printf("mail (SMTP not configured, not sent): to=%s subject=%q\n%s", to, subject, body)
	return nil
}
