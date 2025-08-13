-- ////////// Drop tables if they already exist: /////////////////

DROP TABLE IF EXISTS instructor CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS student CASCADE;
DROP TABLE IF EXISTS student_lms_integration CASCADE;
DROP TABLE IF EXISTS exam CASCADE;
DROP TABLE IF EXISTS solution CASCADE;
DROP TABLE IF EXISTS enrollment CASCADE;
DROP TABLE IF EXISTS studentResults CASCADE;
DROP TABLE IF EXISTS scannedExam CASCADE;
DROP TABLE IF EXISTS report CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS grade_appeals CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS lms_integrations CASCADE;


-- ////////// Create tables: /////////////////

CREATE TABLE instructor (
    auth0_id text primary key,
    email text not null,
    name text not null
);

-- TODO: add term information, remove unique constraint
CREATE TABLE classes (
    class_id serial primary key,
    instructor_id text,
    course_id text,
    course_name text,
    active boolean,
    unique (instructor_id, course_id)
);

CREATE TABLE student (
    student_id text primary key,
    auth0_id text NOT NULL unique,
    email text unique,
    name text
);

-- Student LMS Integration table for storing lms id per student
CREATE TABLE student_lms_integration (
    integration_id SERIAL PRIMARY KEY,
    student_id TEXT NOT NULL,
    lms_user_id VARCHAR(255) NOT NULL,
    lms_type VARCHAR(50) NOT NULL, -- 'canvas', 'moodle', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, lms_type),
    FOREIGN KEY (student_id) REFERENCES student(student_id) ON DELETE CASCADE
);

-- Function to update the updated_at column (defined here for use in multiple triggers)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for student_lms_integration updated_at
CREATE TRIGGER update_student_lms_integration_updated_at
BEFORE UPDATE ON student_lms_integration
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- TODO: store pdf template in database
CREATE TABLE exam (
    exam_id serial primary key,
    class_id int not null,
    exam_title text, 
    total_questions int,
    total_marks int,
    template text,
    template_file JSONB,
    mean double precision,
    high double precision,
    low double precision,
    upper_quartile double precision,
    lower_quartile double precision,
    page_count int,
    viewing_options JSONB,
    graded boolean default false,
    exam_max_appeals INT NOT NULL DEFAULT 3 CHECK ( exam_max_appeals > 0 ),
    foreign key (class_id) references classes(class_id)
);

CREATE TABLE solution (
    solution_id serial primary key,
    exam_id int not null,
    answers JSONB, -- Format: [{type: "mcq", questions: [{q1: "A"}, {q2: "B"}]}, {type: "parsons", answerKey: [1,2,3], maxScore: 10, enabled: true}]
    filepath text,
    marking_schemes JSONB,
    single_choice_only boolean default true,
    foreign key (exam_id) references exam(exam_id)
);
CREATE TABLE enrollment(
    enrollment_id serial primary key,
    class_id int,
    student_id text,
    foreign key (class_id) references classes(class_id),
    foreign key (student_id) references student(student_id),
    CONSTRAINT unique_class_student UNIQUE(class_id, student_id)
);

CREATE TABLE studentResults(
    sheet_int serial primary key,
    student_id text not null,
    exam_id int not null,
    chosen_answers JSONB, -- Format: {mcq: [{q1: "A"}, {q2: "B"}], parsons: {sequence: [1,2,3], score: 8.5, maxScore: 10}}
    initial_chosen_answers JSONB, -- This field will store the initial record chosen answers as scanned
    grade DECIMAL(5,2),
    grade_changelog text[],
    image_uuids JSONB DEFAULT '{}', -- Store UUIDs in format {page1: {original: uuid, results: uuid}, page2: {original: uuid, results: uuid}}
    foreign key (exam_id) references exam(exam_id),
    foreign key (student_id) references student(student_id),
    UNIQUE (student_id, exam_id) -- Add unique constraint for UPSERT operations
);

-- Trigger to copy chosen_answers to updated_chosen_answers on first insert
CREATE FUNCTION copy_chosen_answers() RETURNS TRIGGER AS
$$
BEGIN
    IF NEW.initial_chosen_answers IS NULL THEN
        NEW.initial_chosen_answers = NEW.chosen_answers;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_initial_chosen_answers
    BEFORE INSERT ON studentResults
    FOR EACH ROW
EXECUTE FUNCTION copy_chosen_answers();


CREATE TABLE scannedExam(
    scan_id serial primary key,
    exam_id int not null,
    page_count int,
    filepath text,
    foreign key (exam_id) references exam(exam_id)
);

CREATE TABLE grade_appeals(
    grade_appeal_id serial primary key,
    exam_id int not null,
    student_id text not null,
    appeal_details JSONB,
    appeal_time timestamp default now(),
    reply_details JSONB,
    reply_time timestamp,
    foreign key (exam_id) references exam(exam_id) on delete cascade,
    foreign key (student_id) references student(student_id) on delete cascade
);

CREATE VIEW student_grade_appeals_view AS
SELECT g.grade_appeal_id,
       g.exam_id,
       g.student_id,
       g.appeal_details,
       g.appeal_time,
       g.reply_details,
       g.reply_time,
       s.name
FROM grade_appeals g
         JOIN student s ON g.student_id = s.student_id;


-- ////////// Create ENUM type for report status: /////////////////

CREATE TYPE report_status AS ENUM ('Closed', 'Pending');

CREATE TABLE report (
    report_id serial primary key,
    exam_id int not null,
    student_id text not null,
    report_text text not null,
    report_time TIMESTAMP DEFAULT NOW(),
    reply_text text, -- This field will store the instructor's reply
    status report_status DEFAULT 'Pending', -- Column to track report status
    foreign key (exam_id) references exam(exam_id)
);


CREATE TABLE admins(
    auth0_id text primary key,
    email text not null,
    name text not null
);

CREATE TABLE "session" (
    "sid" varchar COLLATE "default" NOT NULL,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- Leaning Management System (LMS) Integrations 
CREATE TABLE lms_integrations  (
    integration_id SERIAL PRIMARY KEY,
    class_id INT NOT NULL UNIQUE,
    lms_type VARCHAR(50) NOT NULL, -- 'canvas', 'moodle', etc.
    lms_course_id VARCHAR(255),      -- The course ID from the external LMS
    encrypted_access_token TEXT NOT NULL,           -- This will be encrypted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_class
        FOREIGN KEY(class_id)
        REFERENCES classes(class_id)
        ON DELETE CASCADE
);

-- Trigger to update the updated_at column on any update
-- This trigger will automatically set the updated_at column to the current timestamp whenever a row is updated
-- in the lms_integrations table.
-- For tracking sensitive date modifications

CREATE TRIGGER update_lms_integrations_updated_at
BEFORE UPDATE ON lms_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically unlink exams from LMS assignments when the class's
-- LMS integration is changed (different provider or course) or removed.
CREATE OR REPLACE FUNCTION unlink_exams_on_lms_change()
RETURNS TRIGGER AS $$
BEGIN
    -- This function is triggered before an UPDATE or DELETE on lms_integrations.
    -- It unlinks exams if the LMS provider/course changes or if the integration is removed.

    -- For UPDATE operations, we only act if the relevant fields are changing.
    -- For DELETE operations, we always act.
    IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (OLD.lms_type IS DISTINCT FROM NEW.lms_type OR OLD.lms_course_id IS DISTINCT FROM NEW.lms_course_id))) THEN
        DELETE FROM exam_lms_integrations
        WHERE exam_id IN (SELECT exam_id FROM exam WHERE class_id = OLD.class_id);
    END IF;

    -- Return the appropriate row to allow the original operation to proceed.
    IF (TG_OP = 'UPDATE') THEN
        RETURN NEW;
    ELSE
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lms_integrations_change_trigger
    BEFORE UPDATE OR DELETE ON lms_integrations
    FOR EACH ROW EXECUTE FUNCTION unlink_exams_on_lms_change();

-- Exam LMS Integration table for storing assignment IDs per exam
CREATE TABLE exam_lms_integrations (
    integration_id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL,
    lms_assignment_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exam(exam_id) ON DELETE CASCADE,
    UNIQUE(exam_id) -- One assignment per exam for now, can be removed later for multiple LMS support
);

-- Trigger for exam_lms_integrations updated_at
CREATE TRIGGER update_exam_lms_integrations_updated_at
BEFORE UPDATE ON exam_lms_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ////////// Test value insertion: /////////////////

INSERT INTO instructor (auth0_id, email, name) VALUES (
    'auth0|6696d634bec6c6d1cc3e2274', 'edu.instructor1@gmail.com', 'Instructor'
);

INSERT INTO student (student_id, auth0_id, email, name) VALUES 
    ('1', 'auth0|669eca4940b5ccd84d81caa2', 'stu.example0@gmail.com', 'Nelson Mirza'),
    ('2', 'auth0|669ecaa440b5ccd84d81caa3', 'stu.example1@gmail.com', 'Bennett Al-Yaqubi'),
    ('3', 'auth0|669ecaa440b5ccd84d81caa4', 'ahmad@example.com', 'Ahmad Ngumo'),
    ('4', 'auth0|669ecaa440b5ccd84d81caa5', 'omar@example.com', 'Omar Witt');

INSERT INTO classes (instructor_id, course_id, course_name, active) VALUES
    ('auth0|6696d634bec6c6d1cc3e2274', 'COSC304', 'Introduction to Database', true),
    ('auth0|6696d634bec6c6d1cc3e2274', 'BIOL265', 'Principles of Genetics', true);

INSERT INTO exam (class_id, exam_title, total_questions, total_marks, graded, viewing_options) VALUES
    (1,'Midterm 1', 50, 50, true, '{"canViewExam": true, "canViewAnswers": false}'),
    (1, 'Midterm 2', 50, 100, true, '{"canViewExam": false, "canViewAnswers": false}'),
    (2, 'Midterm', 50, 50, true, '{"canViewExam": false, "canViewAnswers": true}'),  -- Exams for TEST200
    (2, 'Final', 100, 100, true, '{"canViewExam": true, "canViewAnswers": true}');  -- Exams for TEST200

INSERT INTO solution (exam_id) VALUES
    (1),
    (2);

INSERT INTO enrollment (class_id, student_id) VALUES 
    (1, 1),
    (1, 2),
    (1, 3), 
    (1, 4),
    (2, 1),
    (2, 2),
    (2, 3),
    (2, 4);

INSERT INTO studentResults (student_id, exam_id, chosen_answers, grade) VALUES
(1, 1, '[
    {"q1": "A"}, {"q2": "B"}, {"q3": "C"}, {"q4": "D"}, {"q5": "A"},
    {"q6": "C"}, {"q7": "B"}, {"q8": "D"}, {"q9": "A"}, {"q10": "B"},
    {"q11": "C"}, {"q12": "D"}, {"q13": "A"}, {"q14": "B"}, {"q15": "C"},
    {"q16": "D"}, {"q17": "A"}, {"q18": "B"}, {"q19": "C"}, {"q20": "D"},
    {"q21": "A"}, {"q22": "B"}, {"q23": "C"}, {"q24": "D"}, {"q25": "A"},
    {"q26": "B"}, {"q27": "C"}, {"q28": "D"}, {"q29": "A"}, {"q30": "B"},
    {"q31": "C"}, {"q32": "D"}, {"q33": "A"}, {"q34": "B"}, {"q35": "C"},
    {"q36": "D"}, {"q37": "A"}, {"q38": "B"}, {"q39": "C"}, {"q40": "D"},
    {"q41": "A"}, {"q42": "B"}, {"q43": "C"}, {"q44": "D"}, {"q45": "A"},
    {"q46": "B"}, {"q47": "C"}, {"q48": "D"}, {"q49": "A"}, {"q50": "B"}
]', 50),
(2, 1, '[
    {"q1": "B"}, {"q2": "C"}, {"q3": "D"}, {"q4": "A"}, {"q5": "B"},
    {"q6": "D"}, {"q7": "C"}, {"q8": "A"}, {"q9": "B"}, {"q10": "D"},
    {"q11": "C"}, {"q12": "A"}, {"q13": "B"}, {"q14": "D"}, {"q15": "C"},
    {"q16": "A"}, {"q17": "B"}, {"q18": "D"}, {"q19": "C"}, {"q20": "A"},
    {"q21": "B"}, {"q22": "D"}, {"q23": "C"}, {"q24": "A"}, {"q25": "B"},
    {"q26": "D"}, {"q27": "C"}, {"q28": "A"}, {"q29": "B"}, {"q30": "D"},
    {"q31": "C"}, {"q32": "A"}, {"q33": "B"}, {"q34": "D"}, {"q35": "C"},
    {"q36": "A"}, {"q37": "B"}, {"q38": "D"}, {"q39": "C"}, {"q40": "A"},
    {"q41": "B"}, {"q42": "D"}, {"q43": "C"}, {"q44": "A"}, {"q45": "B"},
    {"q46": "D"}, {"q47": "C"}, {"q48": "A"}, {"q49": "B"}, {"q50": "D"}
]', 11),
(3, 1, '[
    {"q1": "A"}, {"q2": "B"}, {"q3": "C"}, {"q4": "D"}, {"q5": "A"},
    {"q6": "C"}, {"q7": "B"}, {"q8": "D"}, {"q9": "A"}, {"q10": "B"},
    {"q11": "C"}, {"q12": "D"}, {"q13": "A"}, {"q14": "B"}, {"q15": "C"},
    {"q16": "D"}, {"q17": "A"}, {"q18": "B"}, {"q19": "C"}, {"q20": "D"},
    {"q21": "A"}, {"q22": "B"}, {"q23": "C"}, {"q24": "D"}, {"q25": "A"},
    {"q26": "B"}, {"q27": "C"}, {"q28": "D"}, {"q29": "A"}, {"q30": "B"},
    {"q31": "C"}, {"q32": "D"}, {"q33": "A"}, {"q34": "B"}, {"q35": "C"},
    {"q36": "D"}, {"q37": "A"}, {"q38": "B"}, {"q39": "C"}, {"q40": "D"},
    {"q41": "A"}, {"q42": "B"}, {"q43": "C"}, {"q44": "D"}, {"q45": "A"},
    {"q46": "B"}, {"q47": "C"}, {"q48": "D"}, {"q49": "A"}, {"q50": "B"}
]', 50),
(4, 1, '[
    {"q1": "A"}, {"q2": "B"}, {"q3": "C"}, {"q4": "D"}, {"q5": "A"},
    {"q6": "C"}, {"q7": "B"}, {"q8": "D"}, {"q9": "A"}, {"q10": "B"},
    {"q11": "C"}, {"q12": "D"}, {"q13": "A"}, {"q14": "B"}, {"q15": "C"},
    {"q16": "D"}, {"q17": "A"}, {"q18": "B"}, {"q19": "C"}, {"q20": "D"},
    {"q21": "A"}, {"q22": "B"}, {"q23": "C"}, {"q24": "D"}, {"q25": "A"},
    {"q26": "B"}, {"q27": "C"}, {"q28": "D"}, {"q29": "A"}, {"q30": "B"},
    {"q31": "C"}, {"q32": "D"}, {"q33": "A"}, {"q34": "B"}, {"q35": "C"},
    {"q36": "D"}, {"q37": "A"}, {"q38": "B"}, {"q39": "C"}, {"q40": "D"},
    {"q41": "A"}, {"q42": "B"}, {"q43": "C"}, {"q44": "D"}, {"q45": "A"},
    {"q46": "B"}, {"q47": "C"}, {"q48": "D"}, {"q49": "A"}, {"q50": "B"}
]', 50),
(1, 2, '[
    {"q1": "D"}, {"q2": "B"}, {"q3": "C"}, {"q4": "A"}, {"q5": "D"},
    {"q6": "A"}, {"q7": "B"}, {"q8": "C"}, {"q9": "D"}, {"q10": "A"},
    {"q11": "B"}, {"q12": "C"}, {"q13": "D"}, {"q14": "A"}, {"q15": "B"},
    {"q16": "C"}, {"q17": "D"}, {"q18": "A"}, {"q19": "B"}, {"q20": "C"},
    {"q21": "D"}, {"q22": "A"}, {"q23": "B"}, {"q24": "C"}, {"q25": "D"},
    {"q26": "A"}, {"q27": "B"}, {"q28": "C"}, {"q29": "D"}, {"q30": "A"},
    {"q31": "B"}, {"q32": "C"}, {"q33": "D"}, {"q34": "A"}, {"q35": "B"},
    {"q36": "C"}, {"q37": "D"}, {"q38": "A"}, {"q39": "B"}, {"q40": "C"},
    {"q41": "D"}, {"q42": "A"}, {"q43": "B"}, {"q44": "C"}, {"q45": "D"},
    {"q46": "A"}, {"q47": "B"}, {"q48": "C"}, {"q49": "D"}, {"q50": "A"}
]', 69),
(2, 2, '[
    {"q1": "A"}, {"q2": "A"}, {"q3": "B"}, {"q4": "C"}, {"q5": "D"},
    {"q6": "A"}, {"q7": "B"}, {"q8": "C"}, {"q9": "D"}, {"q10": "A"},
    {"q11": "B"}, {"q12": "C"}, {"q13": "D"}, {"q14": "A"}, {"q15": "B"},
    {"q16": "C"}, {"q17": "D"}, {"q18": "A"}, {"q19": "B"}, {"q20": "C"},
    {"q21": "D"}, {"q22": "A"}, {"q23": "B"}, {"q24": "C"}, {"q25": "D"},
    {"q26": "A"}, {"q27": "B"}, {"q28": "C"}, {"q29": "D"}, {"q30": "A"},
    {"q31": "B"}, {"q32": "C"}, {"q33": "D"}, {"q34": "A"}, {"q35": "B"},
    {"q36": "C"}, {"q37": "D"}, {"q38": "A"}, {"q39": "B"}, {"q40": "C"},
    {"q41": "D"}, {"q42": "A"}, {"q43": "B"}, {"q44": "C"}, {"q45": "D"},
    {"q46": "A"}, {"q47": "B"}, {"q48": "C"}, {"q49": "D"}, {"q50": "A"}
]', 85),
(3, 2, '[
    {"q1": "D"}, {"q2": "B"}, {"q3": "C"}, {"q4": "A"}, {"q5": "D"},
    {"q6": "A"}, {"q7": "B"}, {"q8": "C"}, {"q9": "D"}, {"q10": "A"},
    {"q11": "B"}, {"q12": "C"}, {"q13": "D"}, {"q14": "A"}, {"q15": "B"},
    {"q16": "C"}, {"q17": "D"}, {"q18": "A"}, {"q19": "B"}, {"q20": "C"},
    {"q21": "D"}, {"q22": "A"}, {"q23": "B"}, {"q24": "C"}, {"q25": "D"},
    {"q26": "A"}, {"q27": "B"}, {"q28": "C"}, {"q29": "D"}, {"q30": "A"},
    {"q31": "B"}, {"q32": "C"}, {"q33": "D"}, {"q34": "A"}, {"q35": "B"},
    {"q36": "C"}, {"q37": "D"}, {"q38": "A"}, {"q39": "B"}, {"q40": "C"},
    {"q41": "D"}, {"q42": "A"}, {"q43": "B"}, {"q44": "C"}, {"q45": "D"},
    {"q46": "A"}, {"q47": "B"}, {"q48": "C"}, {"q49": "D"}, {"q50": "A"}
]', 69),
(4, 2, '[
    {"q1": "A"}, {"q2": "A"}, {"q3": "B"}, {"q4": "C"}, {"q5": "D"},
    {"q6": "A"}, {"q7": "B"}, {"q8": "C"}, {"q9": "D"}, {"q10": "A"},
    {"q11": "B"}, {"q12": "C"}, {"q13": "D"}, {"q14": "A"}, {"q15": "B"},
    {"q16": "C"}, {"q17": "D"}, {"q18": "A"}, {"q19": "B"}, {"q20": "C"},
    {"q21": "D"}, {"q22": "A"}, {"q23": "B"}, {"q24": "C"}, {"q25": "D"},
    {"q26": "A"}, {"q27": "B"}, {"q28": "C"}, {"q29": "D"}, {"q30": "A"},
    {"q31": "B"}, {"q32": "C"}, {"q33": "D"}, {"q34": "A"}, {"q35": "B"},
    {"q36": "C"}, {"q37": "D"}, {"q38": "A"}, {"q39": "B"}, {"q40": "C"},
    {"q41": "D"}, {"q42": "A"}, {"q43": "B"}, {"q44": "C"}, {"q45": "D"},
    {"q46": "A"}, {"q47": "B"}, {"q48": "C"}, {"q49": "D"}, {"q50": "A"}
]', 85);


INSERT INTO scannedExam (exam_id) VALUES (
    1
);

-- Insert values into the report table:
INSERT INTO report (exam_id, student_id, report_text, reply_text, status) VALUES 
(1, '1', 'I think Q5 is incorrectly marked.', 'I reviewed your answer for Q5. The marking is correct according to the scheme. Please refer to the marking guide.', 'Closed'),
(2, '2', 'Can you explain the grading for the final exam?', 'Sure, the grading is based on the rubric provided in class.', 'Closed');

INSERT INTO admins (auth0_id, email, name) VALUES (
    'auth0|6697fe650e143a8cede3ec08', 'sys.controller0@gmail.com', 'Admin'
);
