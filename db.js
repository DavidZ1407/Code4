// Import from the jsr:@db/sqlite package
import { Database } from "jsr:@db/sqlite";

// Specify SQLite file
const dbFilePath = "hochschule.db";

// Connect to database
const db = new Database(dbFilePath);

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

try {
  // Example: output all students
  const students = db.prepare("SELECT * FROM student").all();
  console.log(students);
} finally {
  db.close();
}