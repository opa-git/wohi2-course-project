const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const seedQuestions = [
  {
    question: "What does HTTP stand for?",
    answer: "HyperText Transfer Protocol"
  },
  {
    question: "What does API stand for?",
    answer: "Application Programming Interface"
  },
  {
    question: "What does JSON stand for?",
    answer: "JavaScript Object Notation"
  },
  {
    question: "What runtime allows JavaScript to run on the server?",
    answer: "Node.js"
  }
];

async function main() {
  await prisma.question.deleteMany();

  await prisma.question.createMany({
    data: seedQuestions
  });

  console.log("Seed data inserted successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());