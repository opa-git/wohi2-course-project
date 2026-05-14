const {
  resetDb,
  registerAndLogin,
  createQuestion,
  request,
  app,
  prisma
} = require("./helpers");

beforeEach(resetDb);

describe("question tests", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/questions");

    expect(res.status).toBe(401);
  });

  it("returns 200 list with pagination shape", async () => {
    const token = await registerAndLogin();

    await createQuestion(token);

    const res = await request(app)
      .get("/api/questions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(5);
    expect(res.body.total).toBe(1);
    expect(res.body.totalPages).toBe(1);
  });

  it("returns 404 for unknown question", async () => {
    const token = await registerAndLogin();

    const res = await request(app)
      .get("/api/questions/99999")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Question not found");
  });

  it("returns 400 for invalid question body", async () => {
    const token = await registerAndLogin();

    const res = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "" });

    expect(res.status).toBe(400);
  });

  it("creates a question", async () => {
    const token = await registerAndLogin();

    const res = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "What is JSON?",
        answer: "JavaScript Object Notation",
        keywords: "json,javascript"
      });

    expect(res.status).toBe(201);
    expect(res.body.question).toBe("What is JSON?");
    expect(res.body.answer).toBe("JavaScript Object Notation");
    expect(res.body.keywords).toEqual(
        expect.arrayContaining(["json", "javascript"])
    );
    expect(res.body.keywords).toHaveLength(2);
});

  it("returns 403 when editing someone else's question", async () => {
    const aliceToken = await registerAndLogin("alice@test.io", "Alice");

    const question = await createQuestion(aliceToken, {
      question: "Alice question"
    });

    const bobToken = await registerAndLogin("bob@test.io", "Bob");

    const res = await request(app)
      .put(`/api/questions/${question.id}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        question: "Hijacked",
        answer: "Wrong",
        keywords: "bad"
      });

    expect(res.status).toBe(403);

    const after = await prisma.question.findUnique({
      where: { id: question.id }
    });

    expect(after.question).toBe("Alice question");
  });

  it("updates own question", async () => {
    const token = await registerAndLogin();

    const question = await createQuestion(token);

    const res = await request(app)
      .put(`/api/questions/${question.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "Updated question",
        answer: "Updated answer",
        keywords: "updated"
      });

    expect(res.status).toBe(200);
    expect(res.body.question).toBe("Updated question");
    expect(res.body.answer).toBe("Updated answer");
  });

  it("deletes own question", async () => {
    const token = await registerAndLogin();

    const question = await createQuestion(token);

    const res = await request(app)
      .delete(`/api/questions/${question.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const after = await prisma.question.findUnique({
      where: { id: question.id }
    });

    expect(after).toBe(null);
  });
});