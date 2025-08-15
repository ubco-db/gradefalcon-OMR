import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import { useAuth0 } from "@auth0/auth0-react";
import useGradeAppealApi from "../api/useGradeAppealApi";

export const AnswerGrid = ({ totalQuestions, correctAnswers, studentAnswers, appealing=false, examId=null, studentId=null, onSuccessAppealSubmit = null }) => {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [confirmations, setConfirmations] = useState({});
  const [ noUnresolved, setNoUnresolved ] = useState(false);
  const { submitAppeal, fetchUnresolvedAppeals } = useGradeAppealApi();


  useEffect(() => {
    
    const fetchUnresolved =  async () => {
      const hasUnresolvedData = await fetchUnresolvedAppeals(examId, studentId);
      setNoUnresolved(!hasUnresolvedData?.success);
    }
    fetchUnresolved();
    setSelectedAnswers({});
    setConfirmations({});
  }, [examId, studentId]);

  

  const handleAnswerClick = (questionKey, option) => {
    if (!appealing || !noUnresolved ) return;
    setSelectedAnswers(prev => {
      const newSelectedAnswers = { ...prev };
      if (newSelectedAnswers[questionKey]?.includes(option)) {
        newSelectedAnswers[questionKey] = newSelectedAnswers[questionKey].filter(ans => ans !== option);
        if (newSelectedAnswers[questionKey].length === 0) {
          delete newSelectedAnswers[questionKey];
        }
      } else {
        newSelectedAnswers[questionKey] = [...(newSelectedAnswers[questionKey] || []), option];
      }
      return newSelectedAnswers;
    });
  };

  const handleConfirmClick = (questionKey) => {
    if (!appealing || !noUnresolved) return;
    setConfirmations(prev => ({
      ...prev,
      [questionKey]: true
    }));
  };
  const handleUndoClick = (questionKey) => {
    if (!appealing || !noUnresolved ) return;
    setSelectedAnswers(prev => {
      const newSelectedAnswers = { ...prev };
      delete newSelectedAnswers[questionKey];
      return newSelectedAnswers;
    });
    setConfirmations(prev => {
      const newConfirmations = { ...prev };
      delete newConfirmations[questionKey];
      return newConfirmations;
    });
  };

  const allSelectedConfirmed = Object.keys(selectedAnswers).every(qKey => confirmations[qKey]);


  const handleSubmit = async () => {
    if (!appealing || !noUnresolved ) return;
    const modifiedAnswers = Object.keys(selectedAnswers)
        .filter(qKey => confirmations[qKey] && selectedAnswers[qKey][0] !== answers.student[qKey])
        .map(qKey => ({ [qKey]: selectedAnswers[qKey][0] }));
    
      const res = await submitAppeal(examId, studentId, modifiedAnswers);
      setSelectedAnswers({});
      onSuccessAppealSubmit(res?.success, res?.error);
  };

  const formatAnswers = useCallback(() => {
    const formatted = {
      correct: {},
      student: {},
      parsons: null
    };

    // Format correct answers from [{q1:A},{q2:B}] to {q1:A,q2:B}
    if (Array.isArray(correctAnswers)) {
      correctAnswers.forEach(answers => {
        const[[key, value]] = Object.entries(answers);
        formatted.correct[key] = value;
      })
    }

    // Handle new structured format: {mcq: [{q1:A},{q2:B}], parsons: {...}}
    if (studentAnswers && studentAnswers.mcq) {
      studentAnswers.mcq.forEach(answer => {
        const [[key, value]] = Object.entries(answer);
        formatted.student[key] = value;
      });
      formatted.parsons = studentAnswers.parsons;
    }
 
    return formatted;
  }, [correctAnswers, studentAnswers]);

  const answers = useMemo(() => formatAnswers(), [formatAnswers]);
  return (
    <Card className="bg-white border rounded-lg w-fulifSuccessl">
      <CardHeader className="flex flex-row items-center bg-muted/50 px-6 py-4">
        <CardTitle>Answer Comparison</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px] p-6 border-b rounded-lg text-sm xxl:text-base">
        <ScrollArea className="h-full w-full">
          <div className="answer-bubble-grid space-y-2">
            {Array.from({ length: totalQuestions }, (_, i) => {
              const qKey = `q${i + 1}`;
              return (
                <div key={qKey} className="question mb-4 flex items-center">
                  <span className="w-8">{i + 1})</span>
                  <div className="options flex space-x-2">
                    {["A", "B", "C", "D", "E"].map(option => {
                      const isCorrect = answers.correct[qKey] === option;
                      const isStudentAnswer = answers.student[qKey] === option;
                      const isSelected = selectedAnswers[qKey]?.includes(option);
                      const isConfirmed = confirmations[qKey];
                      
                      let classNames = [];

                      if (isCorrect && isStudentAnswer && isSelected) {
                        classNames = ["bg-green-600", "text-white", "border-2", "border-blue-700"]; // Correct, Student's answer, and Selected
                      } else if (isCorrect && isStudentAnswer) {
                        classNames = ["bg-green-500", "text-white"]; // Correct and Student's answer
                      } else if (isCorrect && isSelected) {
                        classNames = ["bg-green-400", "text-white", "border-2", "border-blue-700"]; // Correct and Selected
                      } else if (isStudentAnswer && isSelected) {
                        classNames = ["bg-red-600", "text-white", "border-2", "border-blue-700"]; // Student's answer and Selected
                      } else if (isCorrect) {
                        classNames = ["bg-green-300", "text-black"]; // Correct only
                      } else if (isStudentAnswer) {
                        classNames = ["bg-red-500", "text-white"]; // Student's answer only
                      } else if (isSelected) {
                        classNames = ["bg-blue-500", "text-white", "border-2", "border-blue-700"]; // Selected only
                      }

                      const className = ["option px-3 py-1 border rounded-full text-sm cursor-pointer", ...classNames].join(" ");
                      


                      return (
                        <div
                          key={option}
                          className={className}
                          onClick={() => handleAnswerClick(qKey, option)}
                        >
                          {option}
                        </div>
                      );
                    })}
                  </div>
                  {appealing && selectedAnswers[qKey] && !confirmations[qKey] && (
                    <div className="flex ml-auto gap-2">
                    <button
                      className="ml-2 px-3 py-1 bg-blue-500 text-white rounded-full"
                      onClick={() => handleConfirmClick(qKey)}
                    >
                      Confirm
                    </button>
                    <button
                      className="ml-2 px-3 py-1 bg-red-500 text-white rounded-full"
                      onClick={() => handleUndoClick(qKey)}
                    >
                      Undo
                    </button>
                    </div>
                  )}
                  {appealing && confirmations[qKey] && selectedAnswers[qKey] !== answers.student[qKey] && (
                    <button
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded-full"
                      onClick={() => handleUndoClick(qKey)}
                    >
                      Undo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Parsons Problem Section */}
          {answers.parsons && (
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-lg font-semibold mb-3">Parsons Problem (Code Ordering)</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="mb-2">
                  <strong>Student Sequence:</strong> {answers.parsons.sequence ? answers.parsons.sequence.join(' → ') : 'No answer'}
                </div>
                {answers.parsons.correctSequence && (
                  <div className="mb-2">
                    <strong>Correct Sequence:</strong> {answers.parsons.correctSequence.join(' → ')}
                  </div>
                )}
                {answers.parsons.score !== undefined && (
                  <div className="mb-2">
                    <strong>Score:</strong> {answers.parsons.score} / {answers.parsons.maxScore || 10}
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardContent>
        {appealing && noUnresolved && (
             <ButtonContainer
               isAllSelectConfirmed={allSelectedConfirmed}
               selectedAnswers={selectedAnswers}
                handleSubmit={handleSubmit}
             >
             </ButtonContainer>
        )


}
      </CardContent>
    </Card>
  );
};



const ButtonContainer = ({isAllSelectConfirmed, handleSubmit, selectedAnswers}) => {
  let buttonText = "Submit";
  let buttonTitle = "Cannot submit appeal. You have unresolved appeals.";
  const selectedAnswerLength = Object.entries(selectedAnswers).length;
  const disabled = !(isAllSelectConfirmed &&  ( selectedAnswerLength !==0));
  const disabledStyle = "mt-4 px-4 py-2 bg-gray-400 text-white font-bold rounded-lg w-full";
  const enabledStyle = "mt-4 px-4 py-2 bg-green-600 text-white font-bold rounded-lg w-full";

  if (selectedAnswerLength ===0 ) {
    buttonTitle = "Cannot submit, you have to select at least one answers";
  } else if (!isAllSelectConfirmed) {
    buttonTitle = "Cannot submit, you have to confirm all selections";
  }
  if (!disabled) {
    buttonTitle = "Click to submit";
  }

  return (
    <button
      className={disabled? disabledStyle : enabledStyle}
      disabled={disabled}
      title={buttonTitle}
    onClick={handleSubmit}
    >
      {buttonText}
    </button>
  )
  
}
