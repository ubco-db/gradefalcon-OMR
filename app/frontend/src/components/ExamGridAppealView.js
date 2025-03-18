import useGradeAppealApi from "../api/useGradeAppealApi";
import {useEffect, useState} from "react";

import {Card, CardContent, CardHeader, CardTitle} from "./ui/card";
import {ScrollArea} from "@radix-ui/react-scroll-area";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "./ui/table";
import {format} from 'date-fns';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "./ui/tooltip";
import {useNavigate} from "react-router-dom";
import {ReplyAppeal} from "../pages/Instructor/ReplyAppeal";

export const ExamGridAppealView = ({examId}) => {
  const [gradeappeals, setGradeAppeals] = useState([]);
  const {fetchExamUnresolvedGradeAppeals} = useGradeAppealApi();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGradeAppeals = async () => {
      try {
        const response = await fetchExamUnresolvedGradeAppeals(examId)
        const data = response.data;
        setGradeAppeals(data || []);
      } catch (err) {
        console.error("Error fetching exam grade appeals:", err);
      }
    }

    if (examId) {
      fetchGradeAppeals();
    }

  }, [examId]);

  return (
      <div className="flex space-x-4">
        {gradeappeals.length > 0 ? (
            <Card className="bg-white border rounded w-1/2">
              <CardHeader className="flex justify-between px-6 py-4">
                <CardTitle className="mb-2">Student Appeals</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Appeal Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gradeappeals.map((appeal) => (
                          <TooltipProvider key={appeal.grade_appeal_id}>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <TableRow key={appeal.grade_appeal_id}
                                          onClick={() => {
                                            navigate(`/ReplyAppeal/${appeal.grade_appeal_id}`);
                                          }}>
                                  <TableCell>{appeal.student_id}</TableCell>
                                  <TableCell>{appeal.name}</TableCell>
                                  <TableCell>{format(appeal.appeal_time, "yyyy-MM-dd HH:mm:ss")}</TableCell>
                                </TableRow>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Click to reply</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
        ) : (
            <div className="w-1/2 flex flex-col items-center justify-center bg-white border rounded p-4">
              No active appeals
            </div>
        )}
      </div>
  )
}