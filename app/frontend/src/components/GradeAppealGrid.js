import {useEffect, useState} from "react";
import useGradeAppealApi from "../api/useGradeAppealApi";
import {Card, CardContent, CardHeader, CardTitle} from "./ui/card";
import {ScrollArea} from "./ui/scroll-area";
import { useToast } from "./ui/use-toast";
import { useNavigate } from "react-router-dom";


export const GradeAppealGrid = ({gradeAppealId, appealDetails}) => {
  const [decisions, setDecisions] = useState({});
  const [canSubmitReply, setCanSubmitReply] = useState(false);
  const {respondGradeAppeal} = useGradeAppealApi();
  const { toast } = useToast();
  const navigate = useNavigate();

  const confirmString = "confirm";
  const declineString = "decline"
  useEffect(() => {
    setDecisions({});
    setCanSubmitReply(false);
  }, [gradeAppealId]);

  const handleAction = (questionKey, decision) => {
    setDecisions(prev => {
      const newDecisions = {
        ...prev,
        [questionKey]: decision === prev[questionKey] ? null : decision
      };
      
      const allDecided = appealDetails.every(a => {
      return newDecisions[Object.keys(a)[0]] !== undefined && newDecisions[Object.keys(a)[0]] !== null;
    });
      console.log("GradeAppealGrid.js: ", newDecisions);
      console.log("GradeAppealGrid.js: ", allDecided);
    setCanSubmitReply(allDecided);
    return newDecisions;
      
    });
  };

  const handleSubmit = async () => {
    try {
      const replyDetails = appealDetails
        .filter(item => {
          const key = Object.keys(item)[0];
          return decisions[key] === "confirm";
        })

      const result = await respondGradeAppeal(gradeAppealId, replyDetails);
      if (result) {
        // Handle success
        setDecisions({});
        setCanSubmitReply(false);
        toast({
          title: "Success",
          description: "Your response has been successfully submitted.",
          duration: 1000
        })
        setTimeout(() => {
          navigate(-1)
        }, 2000)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while submitting your response.",
        variant: "destructive"
      })
    }
  };

  const allQuestionsDecided = appealDetails.every(item => {
    const key = Object.keys(item)[0];
    return decisions[key] !== undefined;
  });


  return (<Card className="bg-white border rounded-lg w-full">
            <button onClick={() => {
        toast({
        title: "Success",
        description: "Password reset email sent.",
          duration: 1000
          
      });
      }}>Test Button</button>
    <CardHeader className="flex flex-row items-center bg-muted/50 px-6 py-4">
      <CardTitle>Grade Appeal Review</CardTitle>
    </CardHeader>
    <CardContent className="h-[400px] p-6 border-b rounded-lg text-sm xxl:text-base">
      <ScrollArea className="h-full w-full">
        <div className="answer-bubble-grid space-y-2">
          {appealDetails.map(item => {
            const questionKey = Object.keys(item)[0];
            const requestedAnswer = item[questionKey];
            const questionNumber = questionKey.replace('q', '');

            return (<div key={questionKey} className="question mb-4">
              <div className="flex items-center mb-2 pt-2">
                <span className="w-8 font-bold">{questionNumber})</span>
                <div className="text-sm">
                  Student requested answer change to:
                  <span className="ml-2 px-4 py-1 bg-blue-500 text-white rounded-full">
                        {requestedAnswer}
                      </span>
                </div>
              </div>

              <div className="flex ml-8 space-x-2">
                <button
                    className={`px-4 py-2 rounded-md ${decisions[questionKey] === confirmString ? "bg-green-600 text-white" : "bg-gray-200"}`}
                    onClick={() => handleAction(questionKey, confirmString)}
                >
                  Confirm
                </button>
                <button
                    className={`px-4 py-2 rounded-md ${decisions[questionKey] === declineString ? "bg-red-600 text-white" : "bg-gray-200"}`}
                    onClick={() => handleAction(questionKey, declineString)}
                >
                  Decline
                </button>
              </div>
            </div>);
          })}
        </div>
      </ScrollArea>
    </CardContent>
    <CardContent>
      <button
          className={`mt-4 px-4 py-2 font-bold rounded-lg w-full ${allQuestionsDecided && canSubmitReply ? "bg-green-600 text-white" : "bg-gray-400 text-white"}`}
          disabled={!allQuestionsDecided || !canSubmitReply}
          title={!allQuestionsDecided ? "Please respond to all questions" : "Submit your response"}
          onClick={handleSubmit}
      >
        Submit Response
      </button>
    </CardContent>
  </Card>);
};

