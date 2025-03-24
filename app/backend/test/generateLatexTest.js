const fs = require('fs');
const path = require('path');
const { generateLatexDocument, calculateQuestionDistribution } = require('../src/utils/templateGenerator');
const { LAYOUT_PARAMS } = require('../src/utils/templateConstants');

// Create output directory path
const outPath = path.join(__dirname, 'out');

// Ensure test output directory exists
if (!fs.existsSync(outPath)) {
  fs.mkdirSync(outPath, { recursive: true });
}

// Test function to generate LaTeX documents with different question distributions
async function testLatexGeneration() {
  try {
    // Test cases - different question counts and types
    const testCases = [
      { name: 'simple_50q', questions: 50, options: 5 },
      { name: 'simple_25q', questions: 25, options: 4 },
      { name: 'mixed_types', questions: ['MCQ5', 'MCQ5', 'MCQ4', 'MCQ4', 'TF', 'TF', 'MCQ8', 'MCQ8'] },
    ];

    for (const testCase of testCases) {
      console.log(`Generating LaTeX for ${testCase.name}...`);
      
      // Calculate question distribution
      const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(
        testCase.questions, 
        testCase.options, 
        LAYOUT_PARAMS
      );
      
      // Generate LaTeX document
      const latexContent = await generateLatexDocument(
        structuredPositions,
        usedCommandTypes,
        "CPSC 310",
        "Midterm Exam",
        "SECTION 201"
      );
      
      // File name based on test case
      const filename = `test_${testCase.name}.tex`;
      
      // Complete file path
      const outputPath = path.join(outPath, filename);
      
      // Save to file
      fs.writeFileSync(outputPath, latexContent);
      
      console.log(`LaTeX document saved to ${outputPath}`);
    }
    
    console.log('All test cases completed successfully!');
  } catch (error) {
    console.error('Error in LaTeX generation test:', error);
  }
}

// Run the test function
testLatexGeneration(); 