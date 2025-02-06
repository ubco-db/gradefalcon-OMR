import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import React, { useCallback, useEffect } from "react";

export const AnswerGrid = ({ totalQuestions, correctAnswers, studentAnswers }) => {
  const formatAnswers = useCallback(() => {
    const formatted = {
      correct: {},
      student: {}
    };
    
    if (Array.isArray(correctAnswers)) {
      correctAnswers.forEach((answer, index) => {
        if (answer.includes(':')) {
          // Format: ['1:E', '2:E']
          const [questionNum, value] = answer.split(':');
          formatted.correct[`q${questionNum}`] = value;
        } else {
          // Format: ['E', 'E', 'E']
          formatted.correct[`q${index + 1}`] = answer;
        }
      });
    }

    // Format student answers from [{q1:A},{q2:B}] to {q1:A,q2:B}
    studentAnswers?.forEach(answer => {
      const [[key, value]] = Object.entries(answer);
      formatted.student[key] = value;
    });

    return formatted;
  }, [correctAnswers, studentAnswers]);

  const updateGrid = useCallback(() => {
    const answers = formatAnswers();
    const bubbleGrid = document.querySelector(".answer-bubble-grid");
    if (!bubbleGrid) return;

    bubbleGrid.innerHTML = "";

    for (let i = 1; i <= totalQuestions; i++) {
      const questionDiv = document.createElement("div");
      questionDiv.className = "question mb-4 flex items-center";
      questionDiv.innerHTML = `<span class="w-8">${i})</span><div class="options flex space-x-2"></div>`;

      const optionsDiv = questionDiv.querySelector(".options");
      const qKey = `q${i}`;

      for (let j = 0; j < 5; j++) {
        const option = String.fromCharCode(65 + j);
        const optionSpan = document.createElement("span");
        optionSpan.className = "option px-3 py-1 border rounded-full text-sm";
        optionSpan.innerText = option;

        const isCorrect = answers.correct[qKey] === option;
        const isStudentAnswer = answers.student[qKey] === option;

        if (isCorrect && isStudentAnswer) {
          optionSpan.className += " bg-green-500 text-white";
        } else if (isCorrect) {
          optionSpan.className += " bg-yellow-200";
        } else if (isStudentAnswer) {
          optionSpan.className += " bg-red-500 text-white";
        }

        optionsDiv.appendChild(optionSpan);
      }

      bubbleGrid.appendChild(questionDiv);
    }
  }, [totalQuestions, formatAnswers]);

  useEffect(() => {
    updateGrid();
  }, [updateGrid]);

  return (
    <Card className="bg-white border rounded-lg w-full">
      <CardHeader className="flex flex-row items-center bg-muted/50 px-6 py-4">
        <CardTitle>Answer Comparison</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px] p-6">
        <ScrollArea className="h-full w-full">
          <div className="answer-bubble-grid space-y-2"></div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
