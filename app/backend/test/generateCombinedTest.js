const fs = require('fs');
const path = require('path');
const { 
  generateLatexDocument, 
  calculateQuestionDistribution,
  generateCustomJsonTemplate 
} = require('../src/utils/templateGenerator');
const { LAYOUT_PARAMS } = require('../src/utils/templateConstants');

// create output directory path
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// ensure test output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// function to generate and save LaTeX and JSON templates
async function generateAndSaveCombinedTemplates(questions, options, courseId, examTitle, classId, latexFilename, jsonFilename) {
  try {
    console.log(`generating LaTeX and JSON templates...`);
    
    // calculate question distribution first
    const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
    
    // ensure placeQuestionAt command is always included
    usedCommandTypes.add('placeQuestionAt');
    
    // generate LaTeX document
    console.log(`- generating LaTeX document...`);
    const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
    
    // generate JSON template
    console.log(`- generating JSON template...`);
    const jsonTemplate = await generateCustomJsonTemplate(questions, courseId, examTitle, classId, structuredPositions);
    
    // full file paths
    const latexOutputPath = path.join(OUTPUT_DIR, latexFilename);
    const jsonOutputPath = path.join(OUTPUT_DIR, jsonFilename);
    
    // save to files
    fs.writeFileSync(latexOutputPath, latexContent);
    fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonTemplate, null, 2));
    
    console.log(`LaTeX template generated and saved to: ${latexOutputPath}`);
    console.log(`file size: ${fs.statSync(latexOutputPath).size} bytes`);
    
    console.log(`JSON template generated and saved to: ${jsonOutputPath}`);
    console.log(`file size: ${fs.statSync(jsonOutputPath).size} bytes`);
    
    return { latexPath: latexOutputPath, jsonPath: jsonOutputPath };
  } catch (error) {
    console.error(`failed to generate template: ${error.message}`);
    return false;
  }
}

// run tests
async function runTests() {
  console.log('starting combined template tests...');
  
  // test case 1: standard exam (50 questions)
  await generateAndSaveCombinedTemplates(
    50, 
    5, 
    'MATH101', 
    'Midterm Exam', 
    'A1', 
    'combined_standard_template.tex',
    'combined_standard_template.json'
  );
  
  // test case 2: large exam (150 questions, spanning two pages)
  await generateAndSaveCombinedTemplates(
    150, 
    5, 
    'PHYS102', 
    'Final Exam', 
    'B2', 
    'combined_large_template.tex',
    'combined_large_template.json'
  );
  
  // test case 3: mixed
  const mixedQuestionTypes = [
    'MCQ4',  // 4 option multiple choice question
    'MCQ5',  // 5 option multiple choice question
    'TF',    // true/false question
    'MCQ9',  // 9 option multiple choice question
    'MCQ5',
    'MCQ5',
    'TF',
    'MCQ5',
    'MCQ5',
    'TF',
    'MCQ5',
    'MCQ9',
    'MCQ4',
    'MCQ4',
    'MCQ4',
    // add more questions to test pagination
    ...Array(30).fill().map((_, i) => i % 5 === 0 ? 'TF' : 'MCQ5')
  ];
  
  await generateAndSaveCombinedTemplates(
    mixedQuestionTypes,
    null, // no options parameter, because each question has its own type
    'MULTI105',
    'Mixed Types Test',
    'E5',
    'combined_mixed_types_template.tex',
    'combined_mixed_types_template.json'
  );
  
  console.log('all combined template tests completed!');
}

// run all tests
runTests().catch(error => {
  console.error('test execution failed:', error);
}); 