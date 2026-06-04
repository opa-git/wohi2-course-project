const express = require("express");
const multer = require("multer");
const path = require("path");
const { parse } = require("csv-parse/sync");

const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");

const { z } = require("zod");
const { ValidationError, NotFoundError } = require("../lib/errors");

const DIFFICULTIES = ["easy", "medium", "hard"];

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only image files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");

    if (isCsv) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only CSV files allowed"));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

const QuestionInput = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  keywords: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.enum(DIFFICULTIES).optional()
});

const PlayInput = z.object({
  answer: z.string().min(1)
});

function parseKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords;

  if (typeof keywords === "string") {
    return keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  return [];
}

function formatQuestion(question) {
  const solved =
    question.attempts?.some((attempt) => attempt.correct === true) ?? false;

  return {
    ...question,
    keywords: question.keywords?.map((k) => k.name) ?? [],
    userName: question.user?.name || null,
    solved,
    user: undefined,
    attempts: undefined
  };
}

const questionInclude = (userId) => ({
  keywords: true,
  user: true,
  attempts: {
    where: { userId }
  }
});

// Apply authentication to all question routes
router.use(authenticate);

// GET /questions
// List questions with pagination, optional keyword search and difficulty filter
router.get("/", async (req, res, next) => {
  try {
    const { keyword, difficulty } = req.query;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 5));
    const skip = (page - 1) * limit;

    if (difficulty && !DIFFICULTIES.includes(difficulty)) {
      throw new ValidationError("difficulty must be easy, medium or hard");
    }

    const where = {
      ...(keyword
        ? {
            keywords: {
              some: { name: keyword }
            }
          }
        : {}),
      ...(difficulty ? { difficulty } : {})
    };

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: questionInclude(req.user.userId),
        orderBy: { id: "asc" },
        skip,
        take: limit
      }),
      prisma.question.count({ where })
    ]);

    res.json({
      data: questions.map(formatQuestion),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// GET /questions/quiz/random
// Return 10 random questions
router.get("/quiz/random", async (req, res, next) => {
  try {
    const randomRows = await prisma.$queryRaw`
      SELECT id FROM questions ORDER BY RAND() LIMIT 10
    `;

    const ids = randomRows.map((row) => row.id);

    const questions = await prisma.question.findMany({
      where: {
        id: { in: ids }
      },
      include: questionInclude(req.user.userId)
    });

    const orderedQuestions = ids
      .map((id) => questions.find((q) => q.id === id))
      .filter(Boolean);

    res.json({
      data: orderedQuestions.map(formatQuestion),
      total: orderedQuestions.length
    });
  } catch (err) {
    next(err);
  }
});

// POST /questions/import/csv
// Import questions from CSV
router.post("/import/csv", csvUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError("CSV file is required");
    }

    const csvText = req.file.buffer.toString("utf-8");

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (!records.length) {
      throw new ValidationError("CSV file is empty");
    }

    const createdQuestions = [];

    for (const record of records) {
      const input = QuestionInput.parse({
        question: record.question,
        answer: record.answer,
        keywords: record.keywords,
        difficulty: record.difficulty || "easy"
      });

      const keywordsArray = parseKeywords(input.keywords);

      const createdQuestion = await prisma.question.create({
        data: {
          question: input.question,
          answer: input.answer,
          difficulty: input.difficulty || "easy",
          userId: req.user.userId,
          keywords: {
            connectOrCreate: keywordsArray.map((kw) => ({
              where: { name: kw },
              create: { name: kw }
            }))
          }
        },
        include: questionInclude(req.user.userId)
      });

      createdQuestions.push(createdQuestion);
    }

    res.status(201).json({
      message: "Questions imported successfully",
      count: createdQuestions.length,
      data: createdQuestions.map(formatQuestion)
    });
  } catch (err) {
    next(err);
  }
});

// GET /questions/:qId
// Show a specific question
router.get("/:qId", async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);

    const question = await prisma.question.findUnique({
      where: { id: qId },
      include: questionInclude(req.user.userId)
    });

    if (!question) {
      throw new NotFoundError("Question not found");
    }

    res.json(formatQuestion(question));
  } catch (err) {
    next(err);
  }
});

// POST /questions
// Create a new question
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const input = QuestionInput.parse(req.body);
    const { question, answer, keywords, difficulty } = input;

    const keywordsArray = parseKeywords(keywords);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newQuestion = await prisma.question.create({
      data: {
        question,
        answer,
        difficulty: difficulty || "easy",
        imageUrl,
        userId: req.user.userId,
        keywords: {
          connectOrCreate: keywordsArray.map((kw) => ({
            where: { name: kw },
            create: { name: kw }
          }))
        }
      },
      include: questionInclude(req.user.userId)
    });

    res.status(201).json(formatQuestion(newQuestion));
  } catch (err) {
    next(err);
  }
});

// POST /questions/:qId/play
// Submit an answer attempt
router.post("/:qId/play", async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);

    const input = PlayInput.parse(req.body);
    const { answer } = input;

    const question = await prisma.question.findUnique({
      where: { id: qId }
    });

    if (!question) {
      throw new NotFoundError("Question not found");
    }

    const correct =
      answer.trim().toLowerCase() === question.answer.trim().toLowerCase();

    const attempt = await prisma.attempt.create({
      data: {
        questionId: qId,
        userId: req.user.userId,
        submittedAnswer: answer,
        correct
      }
    });

    res.status(201).json({
      id: attempt.id,
      correct: attempt.correct,
      submittedAnswer: attempt.submittedAnswer,
      correctAnswer: question.answer,
      createdAt: attempt.createdAt
    });
  } catch (err) {
    next(err);
  }
});

// PUT /questions/:qId
// Edit a question
router.put("/:qId", isOwner, upload.single("image"), async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);

    const input = QuestionInput.parse(req.body);
    const { question, answer, keywords, difficulty } = input;

    const keywordsArray = parseKeywords(keywords);

    const updateData = {
      question,
      answer,
      difficulty: difficulty || "easy",
      keywords: {
        set: [],
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw },
          create: { name: kw }
        }))
      }
    };

    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
    }

    const updatedQuestion = await prisma.question.update({
      where: { id: qId },
      data: updateData,
      include: questionInclude(req.user.userId)
    });

    res.json(formatQuestion(updatedQuestion));
  } catch (err) {
    next(err);
  }
});

// DELETE /questions/:qId
// Delete a question
router.delete("/:qId", isOwner, async (req, res, next) => {
  try {
    const qId = Number(req.params.qId);

    await prisma.attempt.deleteMany({
      where: { questionId: qId }
    });

    await prisma.question.delete({
      where: { id: qId }
    });

    res.json({
      message: "Question deleted successfully",
      question: formatQuestion(req.question)
    });
  } catch (err) {
    next(err);
  }
});

// Multer errors as JSON
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err instanceof ValidationError) {
    return res.status(400).json({ msg: err.message });
  }

  next(err);
});

module.exports = router;