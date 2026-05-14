const {
  resetDb,
  registerAndLogin,
  createQuestion,
  request,
  app
} = require("./helpers");

beforeEach(resetDb);

describe("attempt tests", () => {
  it("creates a correct attempt", async () => {
    const token = await registerAndLogin();

    const question = await createQuestion(token, {
      question: "Capital of Finland?",
      answer: "Helsinki"
    });

    const res = await request(app)
      .post(`/api/questions/${question.id}/play`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer: "Helsinki" });

    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(true);
    expect(res.body.submittedAnswer).toBe("Helsinki");
    expect(res.body.correctAnswer).toBe("Helsinki");
  });

  it("creates an incorrect attempt", async () => {
    const token = await registerAndLogin();

    const question = await createQuestion(token, {
      question: "Capital of Finland?",
      answer: "Helsinki"
    });

    const res = await request(app)
      .post(`/api/questions/${question.id}/play`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer: "Stockholm" });

    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(false);
    expect(res.body.submittedAnswer).toBe("Stockholm");
    expect(res.body.correctAnswer).toBe("Helsinki");
  });

  it("returns 400 when answer is missing", async () => {
    const token = await registerAndLogin();
    const question = await createQuestion(token);

    const res = await request(app)
      .post(`/api/questions/${question.id}/play`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 when playing unknown question", async () => {
    const token = await registerAndLogin();

    const res = await request(app)
      .post("/api/questions/99999/play")
      .set("Authorization", `Bearer ${token}`)
      .send({ answer: "Anything" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Question not found");
  });

  it("marks question as solved after correct attempt", async () => {
    const token = await registerAndLogin();

    const question = await createQuestion(token, {
      answer: "Helsinki"
    });

    await request(app)
      .post(`/api/questions/${question.id}/play`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer: "Helsinki" });

    const res = await request(app)
      .get(`/api/questions/${question.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.solved).toBe(true);
  });
});