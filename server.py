import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.environ.get("ATTENDANCE_DB", BASE_DIR / "student_attendance.db"))
PORT = int(os.environ.get("PORT", "8000"))
SAMPLE_STUDENTS = [
    ("ST001", "Kwame Mensah", "Computer Science", "100", "Present"),
    ("ST002", "Ama Owusu", "Information Technology", "100", "Absent"),
    ("ST003", "Kofi Asare", "Computer Science", "100", "Late"),
    ("ST004", "Efua Boateng", "Mathematics", "200", "Present"),
    ("ST005", "Daniel Addo", "Business Administration", "100", "Absent"),
    ("ST006", "Nana Konadu", "Accounting", "300", "Late"),
    ("ST007", "Yaw Appiah", "Physics", "200", "Present"),
    ("ST008", "Abigail Mensah", "English Literature", "100", "Present"),
]
VALID_STATUSES = {"Present", "Absent", "Late"}


@contextmanager
def connect_database():
    connection = sqlite3.connect(DATABASE_PATH)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY COLLATE NOCASE,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                course TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT '',
                gender TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS attendance (
                student_id TEXT NOT NULL COLLATE NOCASE,
                attendance_date TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late')),
                PRIMARY KEY (student_id, attendance_date),
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );
            """
        )
        count = connection.execute("SELECT COUNT(*) FROM students").fetchone()[0]
        if count == 0:
            connection.executemany(
                "INSERT INTO students (id, name, course, level) VALUES (?, ?, ?, ?)",
                [(student_id, name, course, level) for student_id, name, course, level, _ in SAMPLE_STUDENTS],
            )
            connection.executemany(
                "INSERT INTO attendance (student_id, attendance_date, status) VALUES (?, ?, ?)",
                [(student_id, date.today().isoformat(), status) for student_id, _, _, _, status in SAMPLE_STUDENTS],
            )


class AttendanceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def send_json(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid request length.") from error
        if length <= 0 or length > 1_000_000:
            raise ValueError("Request body must be between 1 byte and 1 MB.")
        try:
            payload = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Request body must contain valid JSON.") from error
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    @staticmethod
    def validate_date(value):
        try:
            return date.fromisoformat(value).isoformat()
        except (TypeError, ValueError) as error:
            raise ValueError("Date must use YYYY-MM-DD format.") from error

    def do_GET(self):
        request = urlparse(self.path)
        if request.path == "/api/students":
            with connect_database() as connection:
                rows = connection.execute(
                    "SELECT id, name, email, phone, course, level, gender FROM students ORDER BY name COLLATE NOCASE"
                ).fetchall()
            self.send_json(200, [dict(row) for row in rows])
            return

        if request.path == "/api/attendance":
            query = parse_qs(request.query)
            try:
                attendance_date = self.validate_date(query.get("date", [None])[0])
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return
            with connect_database() as connection:
                rows = connection.execute(
                    "SELECT student_id, status FROM attendance WHERE attendance_date = ?",
                    (attendance_date,),
                ).fetchall()
            self.send_json(200, [dict(row) for row in rows])
            return

        if request.path.startswith("/api/"):
            self.send_json(404, {"error": "API endpoint not found."})
            return

        relative_path = unquote(request.path).lstrip("/")
        requested_file = (BASE_DIR / relative_path).resolve()
        if os.path.commonpath((str(BASE_DIR), str(requested_file))) != str(BASE_DIR):
            self.send_error(404)
            return
        if request.path == "/" or requested_file.is_dir():
            self.path = "/Index.html"
        super().do_GET()

    def do_POST(self):
        request_path = urlparse(self.path).path
        if request_path not in {"/api/students", "/api/attendance"}:
            self.send_json(404, {"error": "API endpoint not found."})
            return
        try:
            payload = self.read_json()
            if request_path == "/api/students":
                self.create_student(payload)
            else:
                self.save_attendance(payload)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except sqlite3.IntegrityError as error:
            if request_path == "/api/students" and "UNIQUE constraint failed: students.id" in str(error):
                self.send_json(409, {"error": "That student ID already exists."})
            elif request_path == "/api/students":
                self.send_json(400, {"error": "Student record violates a database constraint."})
            else:
                self.send_json(400, {"error": "Attendance contains an unknown student ID."})
        except sqlite3.Error:
            self.log_error("Database request failed")
            self.send_json(500, {"error": "The database could not save this request."})

    def create_student(self, payload):
        student = {}
        for field, required in (("id", True), ("name", True), ("course", True), ("level", False),
                                ("email", False), ("phone", False), ("gender", False)):
            value = payload.get(field, "")
            if value is None:
                value = ""
            if not isinstance(value, str):
                raise ValueError(f"{field.capitalize()} must be text.")
            value = value.strip()
            if required and not value:
                raise ValueError(f"{field.capitalize()} is required.")
            if len(value) > 200:
                raise ValueError(f"{field.capitalize()} must be 200 characters or fewer.")
            student[field] = value

        with connect_database() as connection:
            connection.execute(
                """INSERT INTO students (id, name, email, phone, course, level, gender)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    student["id"],
                    student["name"],
                    student["email"] or None,
                    student["phone"] or None,
                    student["course"],
                    student["level"],
                    student["gender"] or None,
                ),
            )
        self.send_json(201, {"message": "Student created.", "id": student["id"]})

    def save_attendance(self, payload):
        attendance_date = self.validate_date(payload.get("date"))
        records = payload.get("records")
        if not isinstance(records, list):
            raise ValueError("Records must be a list.")

        normalized_records = []
        seen_ids = set()
        for record in records:
            if not isinstance(record, dict):
                raise ValueError("Each attendance record must be an object.")
            student_id = record.get("student_id")
            status = record.get("status")
            if not isinstance(student_id, str) or not student_id.strip():
                raise ValueError("Each attendance record needs a student ID.")
            student_id = student_id.strip()
            if student_id.casefold() in seen_ids:
                raise ValueError("A student can only have one status per date.")
            if status not in VALID_STATUSES:
                raise ValueError("Status must be Present, Absent, or Late.")
            seen_ids.add(student_id.casefold())
            normalized_records.append((student_id, attendance_date, status))

        with connect_database() as connection:
            connection.executemany(
                """INSERT INTO attendance (student_id, attendance_date, status)
                   VALUES (?, ?, ?)
                   ON CONFLICT (student_id, attendance_date)
                   DO UPDATE SET status = excluded.status""",
                normalized_records,
            )
        self.send_json(200, {"message": "Attendance saved.", "date": attendance_date, "count": len(normalized_records)})

    def do_DELETE(self):
        request_path = urlparse(self.path).path
        prefix = "/api/students/"
        if not request_path.startswith(prefix):
            self.send_json(404, {"error": "API endpoint not found."})
            return
        student_id = unquote(request_path[len(prefix):]).strip()
        if not student_id:
            self.send_json(400, {"error": "Student ID is required."})
            return
        with connect_database() as connection:
            cursor = connection.execute("DELETE FROM students WHERE id = ?", (student_id,))
        if cursor.rowcount == 0:
            self.send_json(404, {"error": "Student not found."})
            return
        self.send_json(200, {"message": "Student and attendance records removed."})


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AttendanceHandler)
    print(f"Student Attendance Portal running at http://127.0.0.1:{PORT}/")
    print(f"SQLite database: {DATABASE_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Student Attendance Portal.")
    finally:
        server.server_close()
