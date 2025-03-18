import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import useGradeAppealApi from "../../api/useGradeAppealApi";
import useExamApi from "../../api/useExamApi";
import { GradeAppealGrid } from "../../components/GradeAppealGrid";
import { Button } from "../../components/ui/button";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { Badge } from "../../components/ui/badge";

const ReplyAppeal = () => {
  const { grade_appeal_id: appealId } = useParams();
  const [appeal, setAppeal] = useState(null);
  const [frontSrc, setFrontSrc] = useState(null);
  const [backSrc, setBackSrc] = useState(null);
  const [showFront, setShowFront] = useState(true);

  const { fetchGradeAppealById } = useGradeAppealApi();
  const { fetchStudentExamImages } = useExamApi();

  useEffect(() => {
    const fetchAppealAndExam = async () => {
      try {
        const response = await fetchGradeAppealById(appealId);
        const appealData = response.data;
        setAppeal(appealData);

        if (appealData?.exam_id && appealData?.student_id) {
          const examImagesResponse = await fetchStudentExamImages(appealData.exam_id, appealData.student_id);
          if (examImagesResponse) {
            console.log("DEBUG ReplyDetails:", examImagesResponse);
            if (examImagesResponse.front) setFrontSrc(examImagesResponse.front);
            if (examImagesResponse.back) setBackSrc(examImagesResponse.back);
          }
        }
      } catch (err) {
        console.error("Error fetching appeal:", err);
      }
    };

    if (appealId) {
      fetchAppealAndExam();
    }
  }, [appealId]);

  return appeal ? (
      <main className="flex flex-col gap-4 p-4">
        {/* Header Section */}
        <div className="w-full mx-auto grid flex-1 auto-rows-max gap-8">
          <div className="flex items-center gap-4">
            <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => window.history.back()}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-2xl font-semibold">Reply to Appeal</h1>
          </div>

          {/* Grade Appeal Grid */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <GradeAppealGrid
                  gradeAppealId={appealId}
                  appealDetails={appeal.appeal_details}
              />
            </div>

            {/* Exam Image Section */}
            <div className="relative flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-7">
              <Badge variant="outline" className="absolute right-3 top-3">
                Exam
              </Badge>
              <div className="flex gap-4 mb-4">
                <Button onClick={() => setShowFront(!showFront)}>Toggle Front/Back</Button>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                {showFront && frontSrc ? (
                    <img
                        src={frontSrc}
                        alt="Student Exam Front Page"
                        style={{
                          maxWidth: "100%",
                          height: "auto",
                        }}
                    />
                ) : showFront && (
                    <p>No front image found</p>
                )}
                {!showFront && backSrc ? (
                    <img
                        src={backSrc}
                        alt="Student Exam Back Page"
                        style={{
                          maxWidth: "100%",
                          height: "auto",
                        }}
                    />
                ) : !showFront && (
                    <p>No back image found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
  ) : (
      <div>Loading...</div>
  );
};

export default ReplyAppeal;
