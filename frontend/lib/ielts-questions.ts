// IELTS-style speaking questions, written for this app in its own words.
//
// Source policy: no questions are copied from IELTS books, past papers or "recent exam
// questions" websites (copyright and site terms). Only the topic areas that commonly appear
// in the test (hometown, work, hobbies, a person, a place, an object, an event...) were used
// as a guide. A fixed bank costs nothing: no LLM call is needed to pick a question.

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
    topic: "Home",
    questions: [
      "Do you live in a house or an apartment?",
      "Which room in your home do you spend the most time in?",
      "What would you change about your home if you could?",
      "Do you plan to live in the same place for a long time?",
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
  {
    topic: "Music",
    questions: [
      "What kind of music do you enjoy?",
      "When do you usually listen to music?",
      "Did you learn to play an instrument as a child?",
      "Has your taste in music changed over the years?",
    ],
  },
  {
    topic: "Reading",
    questions: [
      "Do you enjoy reading? Why or why not?",
      "Do you prefer paper books or reading on a screen?",
      "What did you like to read when you were a child?",
      "Is there a book you would like to read again?",
    ],
  },
  {
    topic: "Sport and exercise",
    questions: [
      "Do you do any sport or exercise?",
      "Which sports are popular in your country?",
      "Did you play sports at school?",
      "Would you like to try a new sport? Which one?",
    ],
  },
  {
    topic: "Shopping",
    questions: [
      "Do you enjoy shopping?",
      "Do you prefer shopping online or in shops?",
      "What was the last thing you bought for yourself?",
      "Do you usually plan what you buy, or do you buy things on impulse?",
    ],
  },
  {
    topic: "Transport",
    questions: [
      "How do you usually travel to work or school?",
      "Is public transport good where you live?",
      "Do you prefer travelling by bus or by motorbike? Why?",
      "How could transport in your city be improved?",
    ],
  },
  {
    topic: "Friends",
    questions: [
      "Do you have a lot of friends?",
      "How do you usually spend time with your friends?",
      "Is it easy for you to make new friends?",
      "Are your friends now different from your friends at school?",
    ],
  },
  {
    topic: "Family",
    questions: [
      "How many people are there in your family?",
      "What do you like to do together as a family?",
      "Who are you closest to in your family?",
      "Do you think families spend enough time together today?",
    ],
  },
  {
    topic: "Films",
    questions: [
      "How often do you watch films?",
      "Do you prefer watching films at home or at the cinema?",
      "What kind of films do you like?",
      "Is there a film you have watched more than once?",
    ],
  },
  {
    topic: "Mornings",
    questions: [
      "What time do you usually get up?",
      "What do you usually do in the morning?",
      "Are you more active in the morning or in the evening?",
      "Is your morning routine different at the weekend?",
    ],
  },
  {
    topic: "Sleep",
    questions: [
      "How many hours do you usually sleep?",
      "Do you ever take a nap during the day?",
      "What do you do when you cannot sleep?",
      "Do you think people sleep less than they used to?",
    ],
  },
  {
    topic: "Neighbours",
    questions: [
      "Do you know your neighbours well?",
      "How often do you talk to your neighbours?",
      "Have your neighbours ever helped you?",
      "What makes someone a good neighbour?",
    ],
  },
  {
    topic: "Holidays",
    questions: [
      "What did you do on your last holiday?",
      "Do you prefer holidays by the sea or in the mountains?",
      "Do you like to plan your holidays or decide on the way?",
      "Which festival in your country do you enjoy most?",
    ],
  },
  {
    topic: "Clothes",
    questions: [
      "What kind of clothes do you usually wear?",
      "Do you care about fashion?",
      "Do you wear different clothes at work and at home?",
      "Is there a piece of clothing you have kept for a long time?",
    ],
  },
  {
    topic: "Photos",
    questions: [
      "Do you like taking photos?",
      "What do you usually take photos of?",
      "Do you print any of your photos?",
      "Do you like being in photos yourself?",
    ],
  },
  {
    topic: "Social media",
    questions: [
      "Which social media apps do you use?",
      "How much time do you spend on social media each day?",
      "Do you post things often, or do you mostly read?",
      "Has social media changed the way you keep in touch with people?",
    ],
  },
  {
    topic: "Animals",
    questions: [
      "Do you have a pet?",
      "Which animals are popular as pets in your country?",
      "Did you have a pet when you were a child?",
      "Would you like to work with animals?",
    ],
  },
  {
    topic: "Learning English",
    questions: [
      "When did you start learning English?",
      "What do you find hardest about English?",
      "How do you practise English outside class?",
      "Why do you want to improve your English?",
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
  {
    topic: "A teacher you remember",
    prompt: "Describe a teacher who had a strong influence on you.",
    points: ["who the teacher was", "what subject they taught", "what they were like", "and explain why they influenced you"],
    part3: [
      "What makes a good teacher?",
      "Will online lessons ever replace teachers in classrooms?",
      "Should teachers be paid more? Why or why not?",
    ],
  },
  {
    topic: "A gift",
    prompt: "Describe a gift you gave to someone.",
    points: ["what the gift was", "who you gave it to", "why you chose it", "and explain how the person reacted"],
    part3: [
      "Why do people give gifts?",
      "Are expensive gifts always better than cheap ones?",
      "How has gift giving changed in your country?",
    ],
  },
  {
    topic: "A celebration",
    prompt: "Describe a celebration you enjoyed.",
    points: ["what was celebrated", "where it took place", "who was there", "and explain why you enjoyed it"],
    part3: [
      "Why are traditional festivals important?",
      "Do young people celebrate festivals differently from older people?",
      "Have celebrations become too commercial?",
    ],
  },
  {
    topic: "An achievement",
    prompt: "Describe something you achieved that made you proud.",
    points: ["what you achieved", "when it happened", "how you achieved it", "and explain why you felt proud"],
    part3: [
      "Is success at school important for success in life?",
      "Should parents reward children for good results?",
      "Do people value money more than other kinds of success?",
    ],
  },
  {
    topic: "A difficult decision",
    prompt: "Describe a difficult decision you made.",
    points: ["what the decision was", "when you made it", "what choices you had", "and explain why it was difficult"],
    part3: [
      "Do young people make decisions differently from older people?",
      "Should children be allowed to make their own decisions?",
      "Is it better to decide quickly or to take time?",
    ],
  },
  {
    topic: "A city you visited",
    prompt: "Describe a city you visited and liked.",
    points: ["where it is", "when you went there", "what you did there", "and explain why you liked it"],
    part3: [
      "What are the advantages of living in a big city?",
      "Why do people move from the countryside to cities?",
      "How can cities become better places to live?",
    ],
  },
  {
    topic: "An object you use every day",
    prompt: "Describe an object you use every day.",
    points: ["what it is", "where you got it", "how you use it", "and explain why it is important to you"],
    part3: [
      "Do people buy too many things they do not need?",
      "Are things made today less durable than in the past?",
      "How has technology changed everyday objects?",
    ],
  },
  {
    topic: "A friend",
    prompt: "Describe a friend you have known for a long time.",
    points: ["who the friend is", "how you met", "what you do together", "and explain why the friendship has lasted"],
    part3: [
      "What makes a good friend?",
      "Is it easier to make friends as a child or as an adult?",
      "Can people have real friendships online?",
    ],
  },
  {
    topic: "A time you were late",
    prompt: "Describe a time when you were late for something important.",
    points: ["what you were late for", "why you were late", "what happened as a result", "and explain how you felt"],
    part3: [
      "Is being on time important in your culture?",
      "Why are some people always late?",
      "How can people manage their time better?",
    ],
  },
  {
    topic: "Something you learned online",
    prompt: "Describe something you learned from the internet.",
    points: ["what you learned", "where you found it", "how long it took", "and explain why you wanted to learn it"],
    part3: [
      "Is information on the internet always reliable?",
      "Will online learning replace universities?",
      "How can people tell good information from bad information?",
    ],
  },
  {
    topic: "A healthy habit",
    prompt: "Describe a healthy habit you have.",
    points: ["what the habit is", "when you started it", "how it helps you", "and explain how you keep doing it"],
    part3: [
      "Why do many people find it hard to live a healthy life?",
      "Should the government do more to help people stay healthy?",
      "Are people today healthier than people in the past?",
    ],
  },
  {
    topic: "A piece of good news",
    prompt: "Describe a piece of good news you received.",
    points: ["what the news was", "when you heard it", "who told you", "and explain why it was good news for you"],
    part3: [
      "Why does the media report more bad news than good news?",
      "How do people usually share news today?",
      "Do people trust the news less than before?",
    ],
  },
  {
    topic: "An old building",
    prompt: "Describe an old building in your town or city.",
    points: ["where it is", "what it looks like", "what it is used for now", "and explain what you think of it"],
    part3: [
      "Should old buildings be protected or replaced?",
      "Who should pay to look after historic buildings?",
      "How have buildings in your country changed?",
    ],
  },
  {
    topic: "A plan for the future",
    prompt: "Describe something you plan to do in the future.",
    points: ["what it is", "when you want to do it", "what you need to do first", "and explain why it matters to you"],
    part3: [
      "Is it important to make long-term plans?",
      "Do young people today have different goals from their parents?",
      "What can stop people from reaching their goals?",
    ],
  },
];

// Learner-facing text stays in Vietnamese (the app's learners are Vietnamese speakers).
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
