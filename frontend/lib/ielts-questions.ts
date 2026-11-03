// IELTS-style speaking questions, written for this app (not official IELTS material).
// A fixed bank costs nothing: no LLM call is needed to pick a question.

export type IeltsPart = "part1" | "part2" | "part3";

export type Part1Topic = { topic: string; questions: string[] };

// Part 3 questions follow the Part 2 topic, as in the real test.
export type CueCard = { topic: string; prompt: string; points: string[]; part3: string[] };

export const PART1_TOPICS: Part1Topic[] = [
  {
    topic: "Hometown",
    questions: [
      "Where is your hometown?",
      "What do you like most about your hometown?",
      "Has your hometown changed much since you were a child?",
      "Would you like to live there in the future? Why or why not?",
    ],
  },
  {
    topic: "Work or studies",
    questions: [
      "Do you work or are you a student?",
      "Why did you choose that job or subject?",
      "What do you find most difficult about it?",
      "What would you like to do in the next few years?",
    ],
  },
  {
    topic: "Food",
    questions: [
      "What kind of food do you usually eat?",
      "Do you prefer eating at home or eating out?",
      "Is there any food you did not like as a child but like now?",
      "Do you often cook? Why or why not?",
    ],
  },
  {
    topic: "Free time",
    questions: [
      "What do you usually do in your free time?",
      "Do you prefer spending free time alone or with other people?",
      "Have your hobbies changed since you were younger?",
      "Is there a new hobby you would like to try?",
    ],
  },
  {
    topic: "Technology",
    questions: [
      "How often do you use your phone each day?",
      "What do you mostly use the internet for?",
      "Is there any app you could not live without?",
      "Do you think people spend too much time on their phones?",
    ],
  },
  {
    topic: "Weather",
    questions: [
      "What is the weather usually like where you live?",
      "What kind of weather do you like most?",
      "Does the weather change your mood?",
      "Do you check the weather forecast often?",
    ],
  },
];

export const CUE_CARDS: CueCard[] = [
  {
    topic: "A useful skill",
    prompt: "Describe a skill you learned that is useful in your daily life.",
    points: ["what the skill is", "when and how you learned it", "how often you use it", "and explain why it is useful to you"],
    part3: [
      "What skills do young people need most today?",
      "Is it better to learn skills at school or from experience?",
      "Do you think some skills will disappear in the future? Why?",
    ],
  },
  {
    topic: "A memorable trip",
    prompt: "Describe a trip you remember well.",
    points: ["where you went", "who you went with", "what you did there", "and explain why you remember it"],
    part3: [
      "Why do people like to travel to other countries?",
      "How has tourism changed the places people visit?",
      "Is it better to travel alone or in a group?",
    ],
  },
  {
    topic: "A person who helped you",
    prompt: "Describe a person who helped you at an important time.",
    points: ["who the person is", "how you know them", "how they helped you", "and explain how you felt about it"],
    part3: [
      "Why do some people help others without being asked?",
      "Should schools teach children to help their community?",
      "Do people help their neighbours less than in the past?",
    ],
  },
  {
    topic: "A website or app",
    prompt: "Describe a website or app that you use often.",
    points: ["what it is", "how you found it", "what you use it for", "and explain why you like it"],
    part3: [
      "How has the internet changed the way people learn?",
      "Is the internet good for students?",
      "Should children's time online be limited? Why or why not?",
    ],
  },
  {
    topic: "A book or film",
    prompt: "Describe a book you read or a film you watched recently.",
    points: ["what it was", "what it was about", "why you chose it", "and explain what you thought of it"],
    part3: [
      "Do people read fewer books today than in the past?",
      "Are films a good way to learn about other cultures?",
      "Should the government support local film makers?",
    ],
  },
  {
    topic: "A place to relax",
    prompt: "Describe a place where you like to relax.",
    points: ["where it is", "how often you go there", "what you do there", "and explain why it helps you relax"],
    part3: [
      "Why do many people find it hard to relax today?",
      "Are public parks important in big cities?",
      "Do young and old people relax in different ways?",
    ],
  },
];

export const PART_INFO: Record<IeltsPart, { title: string; hint: string }> = {
  part1: { title: "Part 1 · Phỏng vấn", hint: "Trả lời ngắn (2–4 câu) về chủ đề quen thuộc. Nói thêm lý do hoặc ví dụ." },
  part2: { title: "Part 2 · Nói dài", hint: "1 phút chuẩn bị, rồi nói liền mạch về cue card và trả lời đủ các ý." },
  part3: { title: "Part 3 · Thảo luận", hint: "Câu hỏi mở: nêu quan điểm, giải thích lý do, đưa ví dụ, so sánh hai mặt." },
};

export function pick<T>(items: T[], not?: T): T {
  if (items.length < 2) return items[0];
  let x = items[Math.floor(Math.random() * items.length)];
  while (x === not) x = items[Math.floor(Math.random() * items.length)];
  return x;
}

// The cue card text sent to the grader as the task prompt.
export function cueCardText(c: CueCard): string {
  return `${c.prompt} You should say: ${c.points.join("; ")}.`;
}
