db.prepare(`CREATE TABLE IF NOT EXISTS student (
  studentNr INTEGER PRIMARY KEY,
  firstName TEXT,
  lastName TEXT,
  course INTEGER,
  semester INTEGER
)`).run();

const insertStudent = db.prepare(
  "INSERT OR IGNORE INTO student (studentNr, firstName, lastName, course, semester) VALUES (?, ?, ?, ?, ?)"
);
insertStudent.run(123, "Klaus", "Meng", 2, 2);