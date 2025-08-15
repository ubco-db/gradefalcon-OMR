# Parsons Problem Integration Guide

This guide explains how to use the new Parsons problem functionality in the OMR grading system.

## Overview

Parsons problems are code ordering exercises where students must arrange code lines in the correct sequence. The system now supports:

- **Bubble Sheet Generation**: PDF templates with position-based digit bubbles
- **OMR Processing**: Automatic detection of student sequences
- **Edit Distance Scoring**: Partial credit based on similarity to correct answer

## Frontend Usage

### 1. Custom Bubble Sheet Component

The `CustomBubbleSheet` component now includes Parsons problem options:

```javascript
// In NewExam.js or similar component
<CustomBubbleSheet 
  courseId={courseId}
  classId={selectedClassId}
  examTitle={examTitle}
  onQuestionsChange={setNumQuestions}
  onOptionsChange={setNumOptions}
  onTemplateIdChange={setTemplateId}
/>
```

### 2. Parsons Problem Configuration

Students can enable Parsons problems by:
1. Checking "Include Parsons Problem (Code Ordering)"
2. Setting number of positions to order (2-8)
3. Setting maximum score (1-50 points)

## Backend API

### Generate Custom Bubble Sheet

**Endpoint**: `POST /api/exam/generateCustomBubbleSheet`

**Request Body**:
```json
{
  "classId": "class123",
  "courseId": "COSC101", 
  "examTitle": "Midterm Exam",
  "numQuestions": 20,
  "numOptions": 5,
  "includeParsonsProblem": true,
  "parsonsPositions": 4,
  "parsonsMaxScore": 10
}
```

### Process OMR with Parsons Scoring

**Endpoint**: `POST /api/omr/process/{exam_id}`

**Request Body**:
```json
{
  "templates": { /* OMR templates */ },
  "evaluation_json": { /* answer key */ },
  "parsons_config": {
    "correct_sequence": [15, 2, 30, 1],
    "max_score": 10
  }
}
```

### Individual Parsons Scoring

**Endpoint**: `POST /api/omr/score_parsons`

**Request Body**:
```json
{
  "student_sequence": [30, 15, 2, 1],
  "correct_sequence": [1, 2, 15, 30], 
  "max_score": 10
}
```

**Response**:
```json
{
  "student_sequence": [30, 15, 2, 1],
  "correct_sequence": [1, 2, 15, 30],
  "score": 4.0,
  "max_score": 10,
  "edit_distance": 6
}
```

## Bubble Sheet Layout

The generated PDF includes:

1. **Student ID Section** (top): 8-digit student ID bubbles
2. **MCQ Questions** (middle): Standard multiple choice questions
3. **Parsons Problem Section** (bottom): Position-based ordering grid

### Parsons Section Format:
```
Position    0  1  2  3  4  5  6  7  8  9
1st         ○  ○  ○  ○  ○  ○  ○  ○  ○  ○
2nd         ○  ○  ○  ○  ○  ○  ○  ○  ○  ○  
3rd         ○  ○  ○  ○  ○  ○  ○  ○  ○  ○
4th         ○  ○  ○  ○  ○  ○  ○  ○  ○  ○
```

Students fill bubbles to indicate item numbers (e.g., for sequence [15, 2, 30, 1]:
- Position 1st: Fill bubble "1" (item 1 goes first)
- Position 2nd: Fill bubble "5" (item 5 goes second)  
- Position 3rd: Fill bubble "2" (item 2 goes third)
- Position 4th: Fill bubble "0" (item 0 goes fourth)

## Scoring Algorithm

The system uses **Edit Distance (Levenshtein Distance)** to calculate partial credit:

1. **Perfect Match**: Full score if sequences are identical
2. **Partial Credit**: Score = max_score × (1 - edit_distance / max_possible_distance)
3. **Minimum Score**: 0 points

### Example Scoring:
- Correct: [1, 2, 15, 30]
- Student: [1, 15, 2, 30] 
- Edit Distance: 2 (swap 2 and 15)
- Score: 10 × (1 - 2/4) = 5 points
