const fs = require("fs");
const path = require("path");
const { LAYOUT_PARAMS, JSON_TEMPLATE_CONSTANTS, LATEX_COMMANDS } = require("./templateConstants");

/**
 * Calculate coordinates for question positioning
 * @param {number} page - Page number
 * @param {number} row - Row number
 * @param {number} col - Column number
 * @param {Object} layoutParams - Layout parameters
 * @param {boolean} isWide - Whether the question type is wide (occupies full row)
 * @param {string} coordType - Coordinate type: "latex" or "template"
 * @returns {Object} - Coordinate object {x, y}
 */
function calculateCoordinates(page, row, col, layoutParams, isWide = false, coordType = "latex") {
  const {
    columnsPerPage,
    rowsPerPage,
    rowHeight,
    colWidth,
    startX,
    firstPageStartY,
    otherPagesStartY
  } = layoutParams;
  const ppi = 150;

  if (coordType === "latex") {
    // LaTeX coordinate calculation logic
    const x = isWide ? startX : startX + (col - 1) * colWidth;
    const y = (page === 1 ? firstPageStartY : otherPagesStartY) + (row - 1) * rowHeight;
    return { x, y };
  } else if (coordType === "template") {
    // JSON template coordinate calculation logic
    const xPos = Math.round(96 + (col - 1) * colWidth * ppi); // Adjust template scale
    const yPos = Math.round((page === 1 ? 476 : 26) - (row - 1) * rowHeight * ppi);  // Adjust template scale
    return { x: xPos, y: yPos };
  }
  
  throw new Error(`Unsupported coordinate type: ${coordType}`);
}

/**
 * Calculate question distribution layout
 * @param {Array|number} questions - Question type array or question count (simple mode)
 * @param {number|undefined} options - Number of options (simple mode)
 * @param {Object} layoutParams - Layout parameters
 * @returns {Object} - {usedCommandTypes, structuredPositions}
 */
function calculateQuestionDistribution(questions, options, layoutParams) {
  const {
    columnsPerPage,
    rowsPerPage
  } = layoutParams;

  // Determine if it's simple mode
  const isSimpleMode = typeof questions === 'number' && (typeof options === 'number' || !options);
  const questionsCount = isSimpleMode ? questions : questions.length;
  
  // Track used command types
  const usedCommandTypes = new Set();
  usedCommandTypes.add('placeQuestionAt'); // This command is always needed
  
  // Create structured position information - New structure: page is first layer, block is second layer
  let structuredPositions = {
    pages: {},
    questionCount: questionsCount
  };
  
  // Handle simple mode (all question types are the same)
  if (isSimpleMode) {
    // Record used command types
    usedCommandTypes.add('mcqOptions');
    
    // Calculate number of questions per page (rows × columns)
    const questionsPerPage = rowsPerPage * columnsPerPage;
    
    // Create matrix for recording physical positions
    let positionMatrix = [];
    
    // Fill physical positions in horizontal priority order
    let currentPage = 1;
    let currentRow = 1;
    let currentCol = 1;
    
    for (let i = 1; i <= questionsCount; i++) {
      // Add current position
      positionMatrix.push({
        physicalIndex: i - 1,  // Physical sequence index (starting from 0)
        page: currentPage,
        row: currentRow,
        col: currentCol
      });
      
      // Update position
      currentCol++;
      if (currentCol > columnsPerPage) {
        currentCol = 1;
        currentRow++;
        
        if (currentRow > rowsPerPage) {
          currentRow = 1;
          currentPage++;
        }
      }
    }
    
    // Calculate total pages
    const totalPages = Math.ceil(questionsCount / questionsPerPage);
    
    // Create single block info for simple mode
    const simpleBlockInfo = {
      blockIndex: 0,
      type: 'mcqOptions',
      optionCount: options || 5
    };
    
    // Now, assign question numbers in vertical priority order
    let questionNumber = 1;
    
    // Initialize page structure first
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      structuredPositions.pages[pageNum] = {
        blocks: {}
      };
    }
    
    // First iterate through all columns
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Initialize block
      structuredPositions.pages[pageNum].blocks[0] = {
        ...simpleBlockInfo,
        questions: []
      };
      
      for (let colNum = 1; colNum <= columnsPerPage; colNum++) {
        // Within the current column, iterate through all rows
        for (let rowNum = 1; rowNum <= rowsPerPage; rowNum++) {
          // Find entry matching this physical position
          const position = positionMatrix.find(p => 
            p.page === pageNum && p.row === rowNum && p.col === colNum
          );
          
          // If matching position is found and there are still questions to assign
          if (position && questionNumber <= questionsCount) {        
            // Add to structured data
            structuredPositions.pages[pageNum].blocks[0].questions.push({
              qnum: questionNumber,
              physicalIndex: position.physicalIndex,
              row: position.row,
              col: position.col
            });
            
            // Increment question number
            questionNumber++;
          }
        }
      }
    }
  } else {
    // Complex mode: Use block-based layout logic
    // Treat consecutive questions of the same size as a block
    
    // Define question type and its space occupation
    const getQuestionTypeInfo = (questionType) => {
      let typeInfo = {
        width: 1,  // Default width is 1 (occupies one column)
        height: 1, // Default height is 1 (occupies one row)
        typeCommand: '', // LaTeX command
        isWide: false,   // Whether it's a wide type
        optionType: '',  // Option type identifier (for block grouping)
        cmdType: ''      // Command type (for tracking used commands)
      };
      
      // Parse question type
      if (typeof questionType === 'string') {
        if (questionType.startsWith('MCQ')) {
          // Multiple choice: number after MCQ indicates option count
          const optCount = parseInt(questionType.substring(3)) || 5;
          
          if (optCount > 6) {
            // More than 8 options use wide type (occupies entire row)
            typeInfo.width = columnsPerPage; // Fill a row
            typeInfo.isWide = true;
            typeInfo.typeCommand = `\\wideOptions{${optCount}}{QNUM_PLACEHOLDER}`;
            typeInfo.optionType = `wideOptions_${optCount}`;
            typeInfo.cmdType = 'wideOptions';
          } else {
            // Standard multiple choice
            typeInfo.typeCommand = `\\mcqOptions{${optCount}}{QNUM_PLACEHOLDER}`;
            typeInfo.optionType = `mcqOptions_${optCount}`;
            typeInfo.cmdType = 'mcqOptions';
          }
        } else if (questionType === 'TF') {
          // True/False questions
          typeInfo.typeCommand = `\\tfOptions{QNUM_PLACEHOLDER}`;
          typeInfo.optionType = 'tfOptions';
          typeInfo.cmdType = 'tfOptions';
        } else if (questionType.startsWith('PARSONS')) {
          // Parsons problem questions - each position needs 2 digits (tens + units)
          const positions = parseInt(questionType.substring(7)) || 4; // Default 4 positions
          typeInfo.width = columnsPerPage; // Full width for multi-digit layout
          typeInfo.height = positions; // Multiple rows for multiple positions
          typeInfo.isWide = true;
          typeInfo.typeCommand = `\\parsonsOptions{Pos QNUM_PLACEHOLDER}{QNUM_PLACEHOLDER}`;
          typeInfo.optionType = `parsonsOptions_${positions}`;
          typeInfo.cmdType = 'parsonsOptions';
        }
        // Remove grid question options
      }
      
      // If type command is empty, use default 5-option multiple choice
      if (!typeInfo.typeCommand) {
        typeInfo.typeCommand = `\\mcqOptions{5}{QNUM_PLACEHOLDER}`;
        typeInfo.optionType = 'mcqOptions_5';
        typeInfo.cmdType = 'mcqOptions';
      }
      
      return typeInfo;
    };
    
    // Group questions into blocks
    let blocks = [];
    let currentBlock = {
      startIndex: 0,
      endIndex: 0,
      type: getQuestionTypeInfo(questions[0]),
      questions: []
    };
    
    // Build blocks
    for (let i = 0; i < questions.length; i++) {
      const questionTypeInfo = getQuestionTypeInfo(questions[i]);
      
      // Record used command types
      usedCommandTypes.add(questionTypeInfo.cmdType);
      
      // Check if need to create new block (when option types differ)
      if (i > 0 && questionTypeInfo.optionType !== currentBlock.type.optionType) {
        // Complete current block
        currentBlock.endIndex = i - 1;
        blocks.push(currentBlock);
        
        // Create new block
        currentBlock = {
          startIndex: i,
          endIndex: i,
          type: questionTypeInfo,
          questions: []
        };
      }
      
      // Add current question to block
      currentBlock.questions.push({
        index: i,
        originalIndex: i,
        typeInfo: questionTypeInfo
      });
    }
    
    // Add last block
    currentBlock.endIndex = questions.length - 1;
    blocks.push(currentBlock);
    
    // Calculate layout for each block
    let currentPage = 1;
    let currentRow = 1;
    let physicalPositions = [];
    
    // Move up one row overall, to leave space above all blocks
    currentRow = 0;
    
    // Process each block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      const blockSize = block.endIndex - block.startIndex + 1;
      const blockType = block.type;
      
      // Add empty row above each block
      currentRow++;
      
      // Check if need to change page
      if (currentRow > rowsPerPage) {
        currentPage++;
        currentRow = 1; // Start from first row on new page
      }
      
      // Calculate physical layout for block
      if (blockType.isWide) {
        // Wide type: each question occupies one row
        for (let q = 0; q < blockSize; q++) {
          const question = block.questions[q];
          
          // Add physical position
          physicalPositions.push({
            originalIndex: question.originalIndex,
            page: currentPage,
            row: currentRow,
            col: 1,
            isWide: true,
            typeCommand: question.typeInfo.typeCommand,
            blockIndex: blockIndex // Add block index
          });
          
          // Move to next row
          currentRow++;
          
          // Check if need to change page
          if (currentRow > rowsPerPage) {
            currentPage++;
            currentRow = 1;
          }
        }
      } else {
        // Normal type: calculate row-column layout
        const blockWidth = blockType.width;
        let blockCols = Math.floor(columnsPerPage / blockWidth);
        let blockRows = Math.ceil(blockSize / blockCols);
        
        // Check if remaining space on current page is enough for entire block
        const rowsLeft = rowsPerPage - currentRow + 1;
        
        // If remaining rows on current page are less than half the block height, change page directly
        if (rowsLeft < Math.ceil(blockRows / 2) && rowsLeft < blockRows) {
          currentPage++;
          currentRow = 1;
        }
        
        // If entire block doesn't fit on one page, need to split
        if (blockRows > rowsPerPage) {
          // Handle oversized blocks (can't fit all rows on one page)
          let questionsPlaced = 0;
          while (questionsPlaced < blockSize) {
            // Calculate rows available on current page
            const rowsAvailable = rowsPerPage - currentRow + 1;
            const questionsPerRow = Math.ceil(blockSize / blockRows);
            const questionsThisPage = Math.min(rowsAvailable * questionsPerRow, blockSize - questionsPlaced);
            
            // Calculate rows and columns for this page
            const rowsThisPage = Math.min(rowsAvailable, Math.ceil(questionsThisPage / questionsPerRow));
            
            // Place questions on current page
            for (let i = 0; i < questionsThisPage; i++) {
              const questionIndex = questionsPlaced + i;
              
              // Calculate row-column position within current page
              const colOnPage = Math.floor(i / rowsThisPage) + 1;
              const rowOnPage = i % rowsThisPage + currentRow;
              
              physicalPositions.push({
                originalIndex: block.questions[questionIndex].originalIndex,
                page: currentPage,
                row: rowOnPage,
                col: colOnPage,
                isWide: false,
                typeCommand: block.questions[questionIndex].typeInfo.typeCommand,
                blockIndex: blockIndex // Add block index
              });
            }
            
            // Update questions placed and current position
            questionsPlaced += questionsThisPage;
            
            // If more questions need placement, move to next page
            if (questionsPlaced < blockSize) {
              currentPage++;
              currentRow = 1;
            } else {
              // All questions placed, update current row
              currentRow += rowsThisPage;
            }
          }
        } else {
          // Standard case: block can fit entirely on current page or span pages
          
          // Calculate available rows on current page
          const availableRows = rowsPerPage - currentRow + 1;
          
          // If remaining rows on current page are enough for entire block
          if (availableRows >= blockRows) {
            // Arrange questions horizontally on current page
            for (let i = 0; i < blockSize; i++) {
              // Calculate row-column position within block (horizontal fill)
              const blockCol = Math.floor(i / blockRows);
              const blockRow = i % blockRows;
              
              // Map to actual page row-column
              const actualCol = blockCol * blockWidth + 1;
              const actualRow = currentRow + blockRow;
              
              // Add physical position
              physicalPositions.push({
                originalIndex: block.questions[i].originalIndex,
                page: currentPage,
                row: actualRow,
                col: actualCol,
                isWide: false,
                typeCommand: block.questions[i].typeInfo.typeCommand,
                blockIndex: blockIndex // Add block index
              });
            }
            
            // Update current row position
            currentRow += blockRows;
          } else {
            // Need cross-page processing
            // Calculate rows on first page and corresponding questions
            const rowsFirstPage = availableRows;
            const questionsFirstPage = rowsFirstPage * blockCols;
            
            // Place questions on first page
            for (let i = 0; i < Math.min(blockSize, questionsFirstPage); i++) {
              // Row-column position on first page
              const blockCol = Math.floor(i / rowsFirstPage);
              const blockRow = i % rowsFirstPage;
              
              const actualCol = blockCol * blockWidth + 1;
              const actualRow = currentRow + blockRow;
              
              physicalPositions.push({
                originalIndex: block.questions[i].originalIndex,
                page: currentPage,
                row: actualRow,
                col: actualCol,
                isWide: false,
                typeCommand: block.questions[i].typeInfo.typeCommand,
                blockIndex: blockIndex // Add block index
              });
            }
            
            // Handle remaining questions (if any)
            if (blockSize > questionsFirstPage) {
              // Move to next page
              currentPage++;
              currentRow = 1;
              
              // Calculate remaining questions and required rows
              const remainingQuestions = blockSize - questionsFirstPage;
              const rowsSecondPage = Math.ceil(remainingQuestions / blockCols);
              
              // Place remaining questions
              for (let i = questionsFirstPage; i < blockSize; i++) {
                // Calculate position on second page
                const blockCol = Math.floor((i - questionsFirstPage) / rowsSecondPage);
                const blockRow = (i - questionsFirstPage) % rowsSecondPage;
                
                const actualCol = blockCol * blockWidth + 1;
                const actualRow = currentRow + blockRow;
                
                physicalPositions.push({
                  originalIndex: block.questions[i].originalIndex,
                  page: currentPage,
                  row: actualRow,
                  col: actualCol,
                  isWide: false,
                  typeCommand: block.questions[i].typeInfo.typeCommand,
                  blockIndex: blockIndex // Add block index
                });
              }
              
              // Update current row position
              currentRow += rowsSecondPage;
            } else {
              // All questions fit on first page, update row number
              currentRow = rowsPerPage + 1; // Ensure next block starts on new page
            }
          }
        }
      }
      
      // If current row exceeds page, prepare next page
      if (currentRow > rowsPerPage) {
        currentPage++;
        currentRow = 1;
      }
    }
    
    // Initialize pages in structured data
    // Get all used page numbers
    const pageNumbers = [...new Set(physicalPositions.map(pos => pos.page))];
    
    // Initialize each page
    pageNumbers.forEach(page => {
      structuredPositions.pages[page] = {
        blocks: {}
      };
    });
    
    // Create structured data for each block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      const blockType = block.type;
      
      // Find which pages this block appears on
      const blockPages = [...new Set(
        physicalPositions
          .filter(pos => pos.blockIndex === blockIndex)
          .map(pos => pos.page)
      )];
      
      // For each page the block is on, initialize block
      blockPages.forEach(page => {
        // Create block data on current page
        structuredPositions.pages[page].blocks[blockIndex] = {
          blockIndex: blockIndex,
          type: blockType.cmdType,
          optionType: blockType.optionType,
          isWide: blockType.isWide,
          startIndex: block.startIndex,
          endIndex: block.endIndex,
          questions: []
        };
      });
    }
    
    // Group by block
    const blockPositions = {};
    
    // Group physical positions for each block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      blockPositions[blockIndex] = [];
      
      // Find all positions belonging to this block
      for (const pos of physicalPositions) {
        if (pos.originalIndex >= block.startIndex && pos.originalIndex <= block.endIndex) {
          blockPositions[blockIndex].push(pos);
        }
      }
      
      // Sort positions in this block by page, column, row
      blockPositions[blockIndex].sort((a, b) => {
        // Sort by page number first
        if (a.page !== b.page) return a.page - b.page;
        // Within same page, sort by column
        if (a.col !== b.col) return a.col - b.col;
        // Within same column, sort by row
        return a.row - b.row;
      });
    }
    
    // Assign question numbers according to reordered sequence
    let questionNumber = 1;
    
    // Process each block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const positions = blockPositions[blockIndex];
      
      // Assign question numbers in vertical order
      for (const pos of positions) {
        // Add to structured data
        const pageStructure = structuredPositions.pages[pos.page];
        const blockStructure = pageStructure.blocks[pos.blockIndex];
        
        blockStructure.questions.push({
          qnum: questionNumber,
          originalIndex: pos.originalIndex,
          row: pos.row,
          col: pos.col
        });
        
        // Increment question number
        questionNumber++;
      }
    }
  }

  return {
    usedCommandTypes,
    structuredPositions
  };
}

/**
 * generate latex document for custom bubble sheet
 * @param {Object} structuredPositions - Structured position information
 * @param {Set<string>} usedCommandTypes - Set of used command types
 * @param {string} courseId - course id
 * @param {string} examTitle - exam title
 * @param {string} classId - class id
 * @param {Object} parsonsConfig - Parsons problem configuration (optional)
 * @returns {string} - LaTeX document content
 */
async function generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId, parsonsConfig = null) {
  // Get total question count from structuredPositions
  const questionsCount = structuredPositions.questionCount;
  
  const metadata = {
    courseId: courseId,
    classId: classId,
    examTitle: examTitle,
    questions: questionsCount,
    options: "custom" // Since we directly use structuredPositions, no explicit options parameter needed
  };

  // Generate student ID area - Use template and insert metadata
  const studentIdCode = LATEX_COMMANDS.studentIdCodeTemplate.replace(
    'METADATA_PLACEHOLDER', 
    JSON.stringify(metadata).replace(/[&%$#_{}]/g, '\\$&')
  );

  // Generate Parsons problem area if provided - always on page 2
  let parsonsCode = '';
  if (parsonsConfig) {
    parsonsCode = LATEX_COMMANDS.generateParsonsAreaTemplate(parsonsConfig.positions);
  }
  
  // Collect all page numbers from structuredPositions
  const allPages = new Set(Object.keys(structuredPositions.pages).map(Number));
  let totalPages = allPages.size > 0 ? Math.max(...allPages) : 1;
  
  // If Parsons problem is included, ensure at least 2 pages
  if (parsonsConfig && totalPages < 2) {
    totalPages = 2;
  }
  
  // Generate LaTeX commands using structuredPositions
  const latexCommands = [];
  
  // Iterate through each page
  Object.keys(structuredPositions.pages).forEach(pageNum => {
    const page = structuredPositions.pages[pageNum];
    
    // Iterate through each block on the page
    Object.keys(page.blocks).forEach(blockIndex => {
      const block = page.blocks[blockIndex];
      
      // Process each question in the block
      block.questions.forEach(question => {
        let typeCommand = '';
        
        // Generate appropriate command based on block type
        if (block.type === 'mcqOptions') {
          const optionCount = block.optionType?.split('_')[1] || 5;
          typeCommand = `\\mcqOptions{${optionCount}}{${question.qnum}}`;
        } else if (block.type === 'tfOptions') {
          typeCommand = `\\tfOptions{${question.qnum}}`;
        } else if (block.type === 'wideOptions') {
          const optionCount = block.optionType?.split('_')[1] || 9;
          typeCommand = `\\wideOptions{${optionCount}}{${question.qnum}}`;
        } else if (block.type === 'parsonsOptions') {
          typeCommand = `\\parsonsOptions{Pos ${question.qnum}}{${question.qnum}}`;
        }
        
        // Use shared coordinate calculation function to calculate coordinates
        const { x, y } = calculateCoordinates(
          parseInt(pageNum), 
          question.row, 
          question.col, 
          LAYOUT_PARAMS,
          block.isWide,
          "latex"
        );
        
        latexCommands.push(
          `\\placeQuestionAt{${pageNum}}{${x.toFixed(2)}}{${y.toFixed(2)}}{${typeCommand}}%`
        );
      });
    });
  });
  
  // Generate question layout code
  const gridLayoutCode = `
    % Dynamically generate all questions
    \\AddToShipoutPictureBG{%
      % Generate options for all questions
      ${latexCommands.join('\n      ')}
    }%
  `;

  // Generate complete LaTeX document
  return `
    ${LATEX_COMMANDS.documentHeaderTemplate}
    
    ${LATEX_COMMANDS.circleCommand}
    ${usedCommandTypes.has('mcqOptions') ? LATEX_COMMANDS.mcqOptionsCommand : ''}
    ${usedCommandTypes.has('tfOptions') ? LATEX_COMMANDS.tfOptionsCommand : ''}
    ${usedCommandTypes.has('gridOptions') ? LATEX_COMMANDS.gridOptionsCommand : ''}
    ${usedCommandTypes.has('wideOptions') ? LATEX_COMMANDS.wideOptionsCommand : ''}
    ${usedCommandTypes.has('parsonsOptions') ? LATEX_COMMANDS.parsonsOptionsCommand : ''}
    ${usedCommandTypes.has('placeQuestionAt') ? LATEX_COMMANDS.placeQuestionAtCommand : ''}
    ${LATEX_COMMANDS.cornerMarkersCode}
    ${studentIdCode}
    ${parsonsCode}
    ${gridLayoutCode}
    
    \\begin{document}
    \\begin{center}
       \\Large{\\textbf{${courseId}: ${examTitle}}}
    \\end{center}
    \\vspace{0.02in}
    \\textit{Please follow the directions on the exam question sheet. Fill in the entire circle that corresponds to your answer for each question on the exam. Erase marks completely to make a change.}
    
    % Content for first page, page layout generated by eso-pic
    \\vspace*{\\fill}
    
    ${Array.from({length: totalPages - 1}, (_, i) => 
      `% Add page ${i + 2}
      \\newpage
      \\vspace*{\\fill}`
    ).join('\n    ')}
    
    \\end{document}
  `;
}

/**
 * generate custom JSON template
 * @param {number} questions - number of questions (or total question count)
 * @param {string} courseId - course id
 * @param {string} examTitle - exam title
 * @param {string} classId - class id
 * @param {Object} structuredPositions - Structured position information
 * @param {Object} parsonsConfig - Parsons problem configuration (optional)
 * @returns {object} - JSON template object
 */
async function generateCustomJsonTemplate(questions, courseId, examTitle, classId, structuredPositions, parsonsConfig = null) {
  const { columnsPerPage, rowsPerPage } = LAYOUT_PARAMS;
  
  // create combined template object
  const combinedTemplate = {
    metadata: {
      courseId,
      examTitle,
      classId,
      totalQuestions: questions
    },
    pages: {}
  };

  // Get all page numbers
  const pageNumbers = Object.keys(structuredPositions.pages).map(Number);
  let pages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  
  // If Parsons problem is included, ensure at least 2 pages
  if (parsonsConfig && pages < 2) {
    pages = 2;
  }
  
  // Create template for each page
  for (let page = 1; page <= pages; page++) {

    // Create template for this page using base template - Create deep copy instead of reference
    let template = JSON.parse(JSON.stringify(JSON_TEMPLATE_CONSTANTS.basePageTemplate));
    
    // Add student ID area only on first page
    if (page === 1) {
      // Copy student ID area configuration
      template.customBubbleFieldTypes = JSON.parse(JSON.stringify(JSON_TEMPLATE_CONSTANTS.studentIdSection.customBubbleFieldTypes));
      template.customLabels = JSON.parse(JSON.stringify(JSON_TEMPLATE_CONSTANTS.studentIdSection.customLabels));
      template.fieldBlocks = {
        StudentID: JSON.parse(JSON.stringify(JSON_TEMPLATE_CONSTANTS.studentIdSection.fieldBlock))
      };
      
      // Parsons problems are now handled on page 2 only
    } else if (page === 2 && parsonsConfig) {
      // Page 2 with Parsons problem - use complete structure
      const parsonsSection = JSON_TEMPLATE_CONSTANTS.generateParsonsSection(parsonsConfig.positions);
      
      // Use the complete structure from generateParsonsSection
      template.customLabels = {};
      template.customBubbleFieldTypes = parsonsSection.customBubbleFieldTypes;
      template.fieldBlocks = parsonsSection.fieldBlocks;
      template.bubbleDimensions = parsonsSection.bubbleDimensions;
      template.templateDimensions = parsonsSection.templateDimensions;
    } else {
      template.customBubbleFieldTypes = {}; // Ensure other pages initialize with empty object
      template.customLabels = {};
      template.fieldBlocks = {};
    }
    
    // If this page has structured data
    if (structuredPositions.pages[page]) {
      const pageStructure = structuredPositions.pages[page];
      
      // Iterate through page by block
      let blockCounter = 1; // Start counting from 1 for each page
      Object.values(pageStructure.blocks).forEach(blockData => {
        // Organize questions by column
        const columnMap = {};
        
        // Group questions in block by column
        blockData.questions.forEach(question => {
          if (!columnMap[question.col]) {
            columnMap[question.col] = [];
          }
          columnMap[question.col].push(question);
        });
        
        // Process each column
        Object.keys(columnMap).forEach(colNum => {
          const column = columnMap[colNum];
          
          // Sort by row
          column.sort((a, b) => a.row - b.row);
          
          // Get position of first question in column as origin
          const firstQuestion = column[0];
          const coordinates = calculateCoordinates(
            page, 
            firstQuestion.row, 
            firstQuestion.col, 
            LAYOUT_PARAMS, 
            blockData.isWide,
            "template"
          );
          
          // Generate labels for all questions
          const fieldLabels = column.map(q => `q${q.qnum}`);
          
          // Get fieldsType
          let blockType = blockData.optionType;
          if (!blockType && blockData.type === 'mcqOptions') {
            blockType = `MCQ${blockData.optionCount || 5}`;
          } else if (!blockType && blockData.type === 'tfOptions') {
            blockType = 'TF';
          } else if (!blockType && blockData.type === 'parsonsOptions') {
            blockType = 'PARSONS';
          }
          
          // Convert optionType to actual blockType
          if (blockType && blockType.startsWith('mcqOptions_')) {
            const optionCount = blockType.split('_')[1];
            blockType = `MCQ${optionCount}`;
          } else if (blockType === 'tfOptions') {
            blockType = 'TF';
          } else if (blockType && blockType.startsWith('parsonsOptions_')) {
            blockType = 'PARSONS';
          }
          
          // Use getQuestionFieldType to get field type configuration
          const fieldTypeConfig = JSON_TEMPLATE_CONSTANTS.getQuestionFieldType(blockType);
          
          // Create block name
          // Extract specific type (without numbers)
          let blockPrefix = '';
          if (blockType.startsWith('MCQ')) {
            blockPrefix = 'MCQ';
          } else if (blockType === 'TF') {
            blockPrefix = 'TF';
          } else if (blockType === 'PARSONS') {
            blockPrefix = 'PARSONS';
          } else {
            blockPrefix = blockType;
          }
          
          // Use incrementing blockCounter as block number
          const blockName = `${blockPrefix}Block${blockCounter++}`;
          
          // Add configuration to template
          template.fieldBlocks[blockName] = {
            fieldDetectionType: fieldTypeConfig.fieldDetectionType,
            bubbleFieldType: fieldTypeConfig.bubbleFieldType,
            origin: [coordinates.x, coordinates.y],
            fieldLabels: fieldLabels,
            bubblesGap: fieldTypeConfig.bubblesGap,
            labelsGap: fieldTypeConfig.labelsGap
          };
        });
      });
    }

    // Store template for this page in combined template
    combinedTemplate.pages[`page_${page}`] = template;
  }

  return combinedTemplate;
}

module.exports = {
  calculateCoordinates,
  calculateQuestionDistribution,
  generateLatexDocument,
  generateCustomJsonTemplate
}; 