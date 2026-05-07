const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

const seedQuestions = [
  {
    question: "What does HTTP stand for?",
    answer: "HyperText Transfer Protocol",
    keywords: ["http", "web"]
  },
  {
    question: "What does API stand for?",
    answer: "Application Programming Interface",
    keywords: ["api", "backend"]
  },
  {
    question: "What does JSON stand for?",
    answer: "JavaScript Object Notation",
    keywords: ["json", "javascript"]
  },
  {
    question: "What runtime allows JavaScript to run on the server?",
    answer: "Node.js",
    keywords: ["nodejs", "backend"]
  }
];

async function main() {
  await prisma.attempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash("1234", 10);

  const user = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: hashedPassword,
      name: "Admin User"
    }
  });

  for (const q of seedQuestions) {
    await prisma.question.create({
      data: {
        question: q.question,
        answer: q.answer,
        userId: user.id,
        keywords: {
          connectOrCreate: q.keywords.map((kw) => ({
            where: { name: kw },
            create: { name: kw }
          }))
        }
      }
    });
  }

  console.log("Seed data inserted successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());