// How to make each English sound (Azure en-US phoneme symbols), in Vietnamese, with the
// mistake Vietnamese learners often make. Shown when a word was said wrongly.
export const PHONEME_TIPS: Record<string, string> = {
  iy: "i dài: kéo môi sang hai bên như đang cười, lưỡi cao phía trước, giữ âm lâu hơn chữ \"i\" tiếng Việt (sheep).",
  ih: "i ngắn, thả lỏng: miệng hơi mở, không kéo môi, đọc nhanh, nghe gần \"i\" pha \"ê\" (ship). Đừng kéo dài thành /i/.",
  eh: "e mở vừa, hàm hạ vừa phải, giống \"e\" tiếng Việt (bed).",
  ae: "Mở miệng rộng, hàm hạ thấp, kéo môi sang ngang; âm nằm giữa \"a\" và \"e\" (cat). Người Việt hay đọc thành \"e\" hoặc \"a\".",
  aa: "a sâu: miệng mở to, lưỡi hạ thấp và lùi về sau (hot, father).",
  ah: "â ngắn: miệng mở vừa, lưỡi ở giữa, thả lỏng, gần \"ă/â\" (cup).",
  ao: "o mở: môi tròn nhẹ, hàm hạ (law); giọng Mỹ thường gần /ɑ/.",
  ax: "Âm schwa: rất ngắn, nhẹ, không nhấn, miệng thả lỏng, gần \"ơ\" (about). Đừng đọc rõ thành \"a\" hay \"o\".",
  er: "\"ơ\" có cong lưỡi: đầu lưỡi cong lên và lùi về sau, không chạm vòm miệng (bird, her).",
  uh: "u ngắn: môi tròn nhẹ, thả lỏng, đọc nhanh (book).",
  uw: "u dài: môi tròn và chu ra, giữ âm lâu (food).",
  ey: "Trượt từ \"ê\" sang \"i\" (day). Đừng đọc thành một âm \"ê\".",
  ay: "Trượt từ \"a\" sang \"i\", như \"ai\" (my).",
  oy: "Trượt từ \"o\" sang \"i\", như \"oi\" (boy).",
  aw: "Trượt từ \"a\" sang \"u\", như \"ao\" (now).",
  ow: "Trượt từ \"ô\" sang \"u\", như \"âu/ôu\" (go). Đừng đọc thành một âm \"ô\".",
  p: "Mím môi rồi bật mạnh, có luồng hơi (đặt tay trước miệng sẽ thấy) (pen).",
  b: "Mím môi, rung dây thanh, không bật hơi (bed).",
  t: "Đầu lưỡi chạm lợi trên (sau răng cửa) rồi bật hơi; khác \"t\" tiếng Việt. Ở cuối từ vẫn phải có /t/ nhẹ.",
  d: "Đầu lưỡi chạm lợi trên, rung dây thanh; không phải \"đ\" tiếng Việt.",
  k: "Cuống lưỡi chạm vòm mềm rồi bật hơi (cat). Ở cuối từ đừng nuốt âm.",
  g: "Như /k/ nhưng rung dây thanh, không bật hơi (go).",
  f: "Răng trên chạm nhẹ môi dưới, thổi hơi (fan).",
  v: "Răng trên chạm môi dưới, rung dây thanh (very). Đừng đọc thành /b/ hay /f/.",
  th: "Đặt đầu lưỡi giữa hai hàm răng, thổi hơi nhẹ, không rung (think). Đừng đọc thành \"th\" tiếng Việt, /t/ hay /s/.",
  dh: "Lưỡi giữa hai hàm răng như /θ/ nhưng rung dây thanh (this). Đừng đọc thành /d/ hay /z/.",
  s: "Đầu lưỡi gần lợi trên, xì hơi rõ. Ở cuối từ (cats, books) phải có /s/; người Việt hay bỏ.",
  z: "Như /s/ nhưng rung dây thanh, như tiếng ong \"zzz\" (zoo, is, dogs).",
  sh: "Môi tròn đẩy ra, lưỡi lùi sau hơn /s/, như tiếng \"suỵt\" (she).",
  zh: "Như /ʃ/ nhưng rung dây thanh (vision).",
  ch: "/t/ nối /ʃ/: đầu lưỡi chạm lợi rồi bật ra với môi tròn (chair); khác \"ch\" tiếng Việt.",
  jh: "/d/ nối /ʒ/, rung dây thanh, môi tròn (job); không đọc thành \"gi/d\" tiếng Việt.",
  m: "Mím môi, ngân qua mũi; ở cuối từ giữ môi khép.",
  n: "Đầu lưỡi chạm lợi trên, ngân qua mũi; ở cuối từ (sun) đầu lưỡi phải chạm lợi.",
  ng: "Cuống lưỡi chạm vòm mềm, ngân qua mũi (sing); đừng thêm /g/ phía sau.",
  l: "Đầu lưỡi chạm lợi trên. Ở cuối từ (feel, school) giữ lưỡi chạm lợi, đừng đọc thành \"u\" hay bỏ.",
  r: "Cong đầu lưỡi lên và lùi về sau, không chạm vòm miệng, môi hơi tròn (red). Không rung lưỡi như \"r\" tiếng Việt.",
  w: "Môi tròn chu ra rồi mở nhanh (we); không đọc thành \"qu\".",
  y: "Lưỡi nâng gần vòm miệng rồi lướt nhanh, như \"i\" lướt (yes).",
  h: "Thở một luồng hơi nhẹ từ cổ họng (hat).",
  hh: "Thở một luồng hơi nhẹ từ cổ họng (hat).",
};

/** A Vietnamese tip for one phoneme; final consonants get a reminder not to drop them. */
export function phonemeTip(phoneme: string, isLast: boolean): string {
  const tip = PHONEME_TIPS[phoneme.toLowerCase()] ?? "";
  const vowel = /^(aa|ae|ah|ao|aw|ax|ay|eh|er|ey|ih|iy|ow|oy|uh|uw)$/.test(phoneme.toLowerCase());
  if (isLast && !vowel) return `${tip} Đây là âm cuối của từ: phát âm rõ, đừng bỏ.`;
  return tip;
}
