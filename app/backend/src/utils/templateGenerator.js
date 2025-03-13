const fs = require("fs");
const path = require("path");
const { LAYOUT_PARAMS, JSON_TEMPLATE_CONSTANTS, LATEX_COMMANDS } = require("./templateConstants");

/**
 * 计算问题的坐标位置
 * @param {number} page - 页码
 * @param {number} row - 行号
 * @param {number} col - 列号
 * @param {Object} layoutParams - 布局参数
 * @param {boolean} isWide - 是否宽题型（占用整行）
 * @param {string} coordType - 坐标类型："latex"或"template"
 * @returns {Object} - 坐标对象 {x, y}
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
  
  if (coordType === "latex") {
    // LaTeX坐标计算逻辑
    const x = isWide ? startX : startX + (col - 1) * colWidth;
    const y = (page === 1 ? firstPageStartY : otherPagesStartY) + (row - 1) * rowHeight;
    return { x, y };
  } else if (coordType === "template") {
    // JSON模板坐标计算逻辑
    const xPos = Math.round(113 + (col - 1) * 267); // 调整模板比例
    const yPos = Math.round(980 - (row - 1) * 36);  // 调整模板比例
    return { x: xPos, y: yPos };
  }
  
  throw new Error(`不支持的坐标类型: ${coordType}`);
}

/**
 * 计算题目分布图布局
 * @param {Array|number} questions - 题目类型数组或题目数量（简单模式）
 * @param {number|undefined} options - 选项数量（简单模式）
 * @param {Object} layoutParams - 布局参数
 * @returns {Object} - {usedCommandTypes, structuredPositions}
 */
function calculateQuestionDistribution(questions, options, layoutParams) {
  const {
    columnsPerPage,
    rowsPerPage
  } = layoutParams;

  // 确定是否为简单模式
  const isSimpleMode = typeof questions === 'number' && (typeof options === 'number' || !options);
  const questionsCount = isSimpleMode ? questions : questions.length;
  
  // 用于跟踪使用的命令类型
  const usedCommandTypes = new Set();
  usedCommandTypes.add('placeQuestionAt'); // 这个命令总是需要的
  
  // 创建结构化的位置信息 - 新结构：页面为第一层，块为第二层
  let structuredPositions = {
    pages: {},
    questionCount: questionsCount
  };
  
  // 处理简单模式（所有题型相同）
  if (isSimpleMode) {
    // 记录使用的命令类型
    usedCommandTypes.add('mcqOptions');
    
    // 计算每页容纳的题目数（行×列）
    const questionsPerPage = rowsPerPage * columnsPerPage;
    
    // 创建用于记录物理位置的矩阵
    let positionMatrix = [];
    
    // 按照水平优先顺序填充物理位置
    let currentPage = 1;
    let currentRow = 1;
    let currentCol = 1;
    
    for (let i = 1; i <= questionsCount; i++) {
      // 添加当前位置
      positionMatrix.push({
        physicalIndex: i - 1,  // 物理顺序索引（从0开始）
        page: currentPage,
        row: currentRow,
        col: currentCol
      });
      
      // 更新位置
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
    
    // 计算总页数
    const totalPages = Math.ceil(questionsCount / questionsPerPage);
    
    // 为简单模式创建单个块信息
    const simpleBlockInfo = {
      blockIndex: 0,
      type: 'mcqOptions',
      optionCount: options || 5
    };
    
    // 现在，按照垂直优先顺序分配题号
    let questionNumber = 1;
    
    // 先初始化页面结构
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      structuredPositions.pages[pageNum] = {
        blocks: {}
      };
    }
    
    // 先遍历所有列
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // 初始化block
      structuredPositions.pages[pageNum].blocks[0] = {
        ...simpleBlockInfo,
        questions: []
      };
      
      for (let colNum = 1; colNum <= columnsPerPage; colNum++) {
        // 在当前列中，遍历所有行
        for (let rowNum = 1; rowNum <= rowsPerPage; rowNum++) {
          // 查找匹配此物理位置的条目
          const position = positionMatrix.find(p => 
            p.page === pageNum && p.row === rowNum && p.col === colNum
          );
          
          // 如果找到匹配的位置，并且还有题目需要分配
          if (position && questionNumber <= questionsCount) {        
            // 添加到结构化数据
            structuredPositions.pages[pageNum].blocks[0].questions.push({
              qnum: questionNumber,
              physicalIndex: position.physicalIndex,
              row: position.row,
              col: position.col
            });
            
            // 递增题号
            questionNumber++;
          }
        }
      }
    }
  } else {
    // 复杂模式：使用block-based布局逻辑
    // 将相同尺寸的连续问题视为一个block
    
    // 定义问题类型及其占用空间
    const getQuestionTypeInfo = (questionType) => {
      let typeInfo = {
        width: 1,  // 默认宽度为1（占一列）
        height: 1, // 默认高度为1（占一行）
        typeCommand: '', // LaTeX命令
        isWide: false,   // 是否是宽类型
        optionType: '',  // 选项类型标识（用于block分组）
        cmdType: ''      // 命令类型（用于追踪使用的命令）
      };
      
      // 解析题型
      if (typeof questionType === 'string') {
        if (questionType.startsWith('MCQ')) {
          // 多选题：MCQ后面的数字表示选项数
          const optCount = parseInt(questionType.substring(3)) || 5;
          
          if (optCount > 6) {
            // 超过8个选项使用宽类型（占用整行）
            typeInfo.width = columnsPerPage; // 占满一行
            typeInfo.isWide = true;
            typeInfo.typeCommand = `\\wideOptions{${optCount}}{QNUM_PLACEHOLDER}`;
            typeInfo.optionType = `wideOptions_${optCount}`;
            typeInfo.cmdType = 'wideOptions';
          } else {
            // 标准多选题
            typeInfo.typeCommand = `\\mcqOptions{${optCount}}{QNUM_PLACEHOLDER}`;
            typeInfo.optionType = `mcqOptions_${optCount}`;
            typeInfo.cmdType = 'mcqOptions';
          }
        } else if (questionType === 'TF') {
          // 判断题
          typeInfo.typeCommand = `\\tfOptions{QNUM_PLACEHOLDER}`;
          typeInfo.optionType = 'tfOptions';
          typeInfo.cmdType = 'tfOptions';
        }
        // 移除网格题选项
      }
      
      // 如果类型命令为空，使用默认的5选项多选题
      if (!typeInfo.typeCommand) {
        typeInfo.typeCommand = `\\mcqOptions{5}{QNUM_PLACEHOLDER}`;
        typeInfo.optionType = 'mcqOptions_5';
        typeInfo.cmdType = 'mcqOptions';
      }
      
      return typeInfo;
    };
    
    // 将问题分组为blocks
    let blocks = [];
    let currentBlock = {
      startIndex: 0,
      endIndex: 0,
      type: getQuestionTypeInfo(questions[0]),
      questions: []
    };
    
    // 构建blocks
    for (let i = 0; i < questions.length; i++) {
      const questionTypeInfo = getQuestionTypeInfo(questions[i]);
      
      // 记录使用的命令类型
      usedCommandTypes.add(questionTypeInfo.cmdType);
      
      // 检查是否需要创建新block（当选项类型不同时）
      if (i > 0 && questionTypeInfo.optionType !== currentBlock.type.optionType) {
        // 完成当前block
        currentBlock.endIndex = i - 1;
        blocks.push(currentBlock);
        
        // 创建新block
        currentBlock = {
          startIndex: i,
          endIndex: i,
          type: questionTypeInfo,
          questions: []
        };
      }
      
      // 将当前问题添加到block
      currentBlock.questions.push({
        index: i,
        originalIndex: i,
        typeInfo: questionTypeInfo
      });
    }
    
    // 添加最后一个block
    currentBlock.endIndex = questions.length - 1;
    blocks.push(currentBlock);
    
    // 计算每个block的布局
    let currentPage = 1;
    let currentRow = 1;
    let physicalPositions = [];
    
    // 整体上移一行，为所有block留出上方空行
    currentRow = 0;
    
    // 处理每个block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      const blockSize = block.endIndex - block.startIndex + 1;
      const blockType = block.type;
      
      // 为每个block上方添加空行
      currentRow++;
      
      // 检查是否需要换页
      if (currentRow > rowsPerPage) {
        currentPage++;
        currentRow = 1; // 在新页面上从第一行开始
      }
      
      // 计算block的物理布局
      if (blockType.isWide) {
        // 宽题型：每题占一行
        for (let q = 0; q < blockSize; q++) {
          const question = block.questions[q];
          
          // 添加物理位置
          physicalPositions.push({
            originalIndex: question.originalIndex,
            page: currentPage,
            row: currentRow,
            col: 1,
            isWide: true,
            typeCommand: question.typeInfo.typeCommand,
            blockIndex: blockIndex // 添加块索引
          });
          
          // 移到下一行
          currentRow++;
          
          // 检查是否需要换页
          if (currentRow > rowsPerPage) {
            currentPage++;
            currentRow = 1;
          }
        }
      } else {
        // 普通题型：计算行列布局
        const blockWidth = blockType.width;
        let blockCols = Math.floor(columnsPerPage / blockWidth);
        let blockRows = Math.ceil(blockSize / blockCols);
        
        // 检查当前页剩余空间是否足够放置整个block
        const rowsLeft = rowsPerPage - currentRow + 1;
        
        // 如果当前页剩余行数不足整个block高度的一半，则直接换页
        if (rowsLeft < Math.ceil(blockRows / 2) && rowsLeft < blockRows) {
          currentPage++;
          currentRow = 1;
        }
        
        // 如果一页放不下整个block，需要拆分
        if (blockRows > rowsPerPage) {
          // 处理超大block的情况（一页放不下所有行）
          let questionsPlaced = 0;
          while (questionsPlaced < blockSize) {
            // 计算当前页可以放置的行数
            const rowsAvailable = rowsPerPage - currentRow + 1;
            const questionsPerRow = Math.ceil(blockSize / blockRows);
            const questionsThisPage = Math.min(rowsAvailable * questionsPerRow, blockSize - questionsPlaced);
            
            // 计算这一页的行数和列数
            const rowsThisPage = Math.min(rowsAvailable, Math.ceil(questionsThisPage / questionsPerRow));
            
            // 在当前页放置题目
            for (let i = 0; i < questionsThisPage; i++) {
              const questionIndex = questionsPlaced + i;
              
              // 计算在当前页内的行列位置
              const colOnPage = Math.floor(i / rowsThisPage) + 1;
              const rowOnPage = i % rowsThisPage + currentRow;
              
              physicalPositions.push({
                originalIndex: block.questions[questionIndex].originalIndex,
                page: currentPage,
                row: rowOnPage,
                col: colOnPage,
                isWide: false,
                typeCommand: block.questions[questionIndex].typeInfo.typeCommand,
                blockIndex: blockIndex // 添加块索引
              });
            }
            
            // 更新已放置的题目数和当前位置
            questionsPlaced += questionsThisPage;
            
            // 如果还有题目需要放置，换到下一页
            if (questionsPlaced < blockSize) {
              currentPage++;
              currentRow = 1;
            } else {
              // 所有题目都已放置，更新当前行
              currentRow += rowsThisPage;
            }
          }
        } else {
          // 标准情况：block可以完全放在当前页或跨页
          
          // 计算当前页可用行数
          const availableRows = rowsPerPage - currentRow + 1;
          
          // 如果当前页的剩余行数足够放置整个block
          if (availableRows >= blockRows) {
            // 在当前页上按水平方式排列题目
            for (let i = 0; i < blockSize; i++) {
              // 计算在block内的行列位置（水平填充）
              const blockCol = Math.floor(i / blockRows);
              const blockRow = i % blockRows;
              
              // 对应到实际页面上的行列
              const actualCol = blockCol * blockWidth + 1;
              const actualRow = currentRow + blockRow;
              
              // 添加物理位置
              physicalPositions.push({
                originalIndex: block.questions[i].originalIndex,
                page: currentPage,
                row: actualRow,
                col: actualCol,
                isWide: false,
                typeCommand: block.questions[i].typeInfo.typeCommand,
                blockIndex: blockIndex // 添加块索引
              });
            }
            
            // 更新当前行位置
            currentRow += blockRows;
          } else {
            // 需要跨页处理
            // 计算第一页可以放置的行数和对应的题目数
            const rowsFirstPage = availableRows;
            const questionsFirstPage = rowsFirstPage * blockCols;
            
            // 放置第一页的题目
            for (let i = 0; i < Math.min(blockSize, questionsFirstPage); i++) {
              // 在第一页上的行列位置
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
                blockIndex: blockIndex // 添加块索引
              });
            }
            
            // 处理剩余题目（如果有）
            if (blockSize > questionsFirstPage) {
              // 移到下一页
              currentPage++;
              currentRow = 1;
              
              // 计算剩余题目数和所需行数
              const remainingQuestions = blockSize - questionsFirstPage;
              const rowsSecondPage = Math.ceil(remainingQuestions / blockCols);
              
              // 放置剩余题目
              for (let i = questionsFirstPage; i < blockSize; i++) {
                // 计算在第二页上的位置
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
                  blockIndex: blockIndex // 添加块索引
                });
              }
              
              // 更新当前行位置
              currentRow += rowsSecondPage;
            } else {
              // 所有题目都放在了第一页，更新行号
              currentRow = rowsPerPage + 1; // 确保下一个block从新页开始
            }
          }
        }
      }
      
      // 如果当前行超出页面，准备下一页
      if (currentRow > rowsPerPage) {
        currentPage++;
        currentRow = 1;
      }
    }
    
    // 初始化结构化数据中的页面
    // 获取所有使用的页码
    const pageNumbers = [...new Set(physicalPositions.map(pos => pos.page))];
    
    // 初始化每个页面
    pageNumbers.forEach(page => {
      structuredPositions.pages[page] = {
        blocks: {}
      };
    });
    
    // 为每个block创建结构化数据
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      const blockType = block.type;
      
      // 找出该block在哪些页面上
      const blockPages = [...new Set(
        physicalPositions
          .filter(pos => pos.blockIndex === blockIndex)
          .map(pos => pos.page)
      )];
      
      // 对于block所在的每个页面，初始化block
      blockPages.forEach(page => {
        // 创建block在当前页的数据
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
    
    // 按照block分组
    const blockPositions = {};
    
    // 对每个block中的物理位置进行分组
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      blockPositions[blockIndex] = [];
      
      // 找出属于这个block的所有位置
      for (const pos of physicalPositions) {
        if (pos.originalIndex >= block.startIndex && pos.originalIndex <= block.endIndex) {
          blockPositions[blockIndex].push(pos);
        }
      }
      
      // 对这个block内的位置按页、列、行排序
      blockPositions[blockIndex].sort((a, b) => {
        // 先按页码排序
        if (a.page !== b.page) return a.page - b.page;
        // 同一页内，先按列排序
        if (a.col !== b.col) return a.col - b.col;
        // 同一列内，按行排序
        return a.row - b.row;
      });
    }
    
    // 按照重新排序后的顺序分配题号
    let questionNumber = 1;
    
    // 处理每个block
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const positions = blockPositions[blockIndex];
      
      // 按照垂直顺序分配题号
      for (const pos of positions) {
        // 添加到结构化数据
        const pageStructure = structuredPositions.pages[pos.page];
        const blockStructure = pageStructure.blocks[pos.blockIndex];
        
        blockStructure.questions.push({
          qnum: questionNumber,
          originalIndex: pos.originalIndex,
          row: pos.row,
          col: pos.col
        });
        
        // 增加题号
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
 * @param {Object} structuredPositions - 结构化的位置信息
 * @param {Set<string>} usedCommandTypes - 使用的命令类型集合
 * @param {string} courseId - course id
 * @param {string} examTitle - exam title
 * @param {string} classId - class id
 * @returns {string} - LaTeX document content
 */
async function generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId) {
  // 从structuredPositions中获取问题总数
  const questionsCount = structuredPositions.questionCount;
  
  const metadata = {
    courseId: courseId,
    classId: classId,
    examTitle: examTitle,
    questions: questionsCount,
    options: "custom" // 由于我们直接使用structuredPositions，不再需要显式的options参数
  };

  // 生成学生ID区域 - 使用模板并插入元数据
  const studentIdCode = LATEX_COMMANDS.studentIdCodeTemplate.replace(
    'METADATA_PLACEHOLDER', 
    JSON.stringify(metadata).replace(/[&%$#_{}]/g, '\\$&')
  );
  
  // 从structuredPositions中收集所有页码
  const allPages = new Set(Object.keys(structuredPositions.pages).map(Number));
  const totalPages = allPages.size > 0 ? Math.max(...allPages) : 1;
  
  // 使用structuredPositions生成LaTeX命令
  const latexCommands = [];
  
  // 遍历每个页面
  Object.keys(structuredPositions.pages).forEach(pageNum => {
    const page = structuredPositions.pages[pageNum];
    
    // 遍历页面上的每个block
    Object.keys(page.blocks).forEach(blockIndex => {
      const block = page.blocks[blockIndex];
      
      // 处理block中的每个问题
      block.questions.forEach(question => {
        let typeCommand = '';
        
        // 根据块的类型生成相应的命令
        if (block.type === 'mcqOptions') {
          const optionCount = block.optionType?.split('_')[1] || 5;
          typeCommand = `\\mcqOptions{${optionCount}}{${question.qnum}}`;
        } else if (block.type === 'tfOptions') {
          typeCommand = `\\tfOptions{${question.qnum}}`;
        } else if (block.type === 'wideOptions') {
          const optionCount = block.optionType?.split('_')[1] || 9;
          typeCommand = `\\wideOptions{${optionCount}}{${question.qnum}}`;
        }
        
        // 使用共享的坐标计算函数计算坐标
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
  
  // 生成题目布局代码
  const gridLayoutCode = `
    % 动态生成所有题目
    \\AddToShipoutPictureBG{%
      % 生成所有题目的选项
      ${latexCommands.join('\n      ')}
    }%
  `;

  // 生成完整的LaTeX文档
  return `
    ${LATEX_COMMANDS.documentHeaderTemplate}
    
    ${LATEX_COMMANDS.circleCommand}
    ${usedCommandTypes.has('mcqOptions') ? LATEX_COMMANDS.mcqOptionsCommand : ''}
    ${usedCommandTypes.has('tfOptions') ? LATEX_COMMANDS.tfOptionsCommand : ''}
    ${usedCommandTypes.has('gridOptions') ? LATEX_COMMANDS.gridOptionsCommand : ''}
    ${usedCommandTypes.has('wideOptions') ? LATEX_COMMANDS.wideOptionsCommand : ''}
    ${usedCommandTypes.has('placeQuestionAt') ? LATEX_COMMANDS.placeQuestionAtCommand : ''}
    ${LATEX_COMMANDS.cornerMarkersCode}
    ${studentIdCode}
    ${gridLayoutCode}
    
    \\begin{document}
    \\begin{center}
       \\Large{\\textbf{${courseId}: ${examTitle}}}
    \\end{center}
    \\vspace{0.02in}
    \\textit{Please follow the directions on the exam question sheet. Fill in the entire circle that corresponds to your answer for each question on the exam. Erase marks completely to make a change.}
    
    % 第一页的内容，页面布局由eso-pic生成
    \\vspace*{\\fill}
    
    ${Array.from({length: totalPages - 1}, (_, i) => 
      `% 添加第${i + 2}页
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
 * @param {Object} structuredPositions - 结构化的位置信息
 * @returns {object} - JSON template object
 */
async function generateCustomJsonTemplate(questions, courseId, examTitle, classId, structuredPositions) {
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

  // 获取所有页码
  const pageNumbers = Object.keys(structuredPositions.pages).map(Number);
  const pages = Math.max(...pageNumbers);
  
  // 为每页创建模板
  for (let page = 1; page <= pages; page++) {

    // 使用基础模板创建此页的模板
    let template = JSON_TEMPLATE_CONSTANTS.basePageTemplate;
    
    // 仅在第一页添加学生ID区域
    if (page === 1) {
      // 复制学生ID区域的配置
      template.customBubbleFieldTypes = {...JSON_TEMPLATE_CONSTANTS.studentIdSection.customBubbleFieldTypes};
      template.customLabels = {...JSON_TEMPLATE_CONSTANTS.studentIdSection.customLabels};
      template.fieldBlocks = {
        StudentID: JSON_TEMPLATE_CONSTANTS.studentIdSection.fieldBlock
      };
    } else {
      template.fieldBlocks = {};
    }
    
    // 如果此页有结构化数据
    if (structuredPositions.pages[page]) {
      const pageStructure = structuredPositions.pages[page];
      
      // 按block遍历页面
      let blockCounter = 1; // 从1开始计数
      Object.values(pageStructure.blocks).forEach(blockData => {
        // 按列组织题目
        const columnMap = {};
        
        // 将block中的题目按列分组
        blockData.questions.forEach(question => {
          if (!columnMap[question.col]) {
            columnMap[question.col] = [];
          }
          columnMap[question.col].push(question);
        });
        
        // 处理每一列
        Object.keys(columnMap).forEach(colNum => {
          const column = columnMap[colNum];
          
          // 按行排序
          column.sort((a, b) => a.row - b.row);
          
          // 获取此列的第一个问题的位置作为origin
          const firstQuestion = column[0];
          const coordinates = calculateCoordinates(
            page, 
            firstQuestion.row, 
            firstQuestion.col, 
            LAYOUT_PARAMS, 
            blockData.isWide,
            "template"
          );
          
          // 生成所有题目的标签
          const fieldLabels = column.map(q => `q${q.qnum}`);
          
          // 获取fieldsType
          let blockType = blockData.optionType;
          if (!blockType && blockData.type === 'mcqOptions') {
            blockType = `MCQ${blockData.optionCount || 5}`;
          } else if (!blockType && blockData.type === 'tfOptions') {
            blockType = 'TF';
          }
          
          // 处理optionType到实际blockType的转换
          if (blockType && blockType.startsWith('mcqOptions_')) {
            const optionCount = blockType.split('_')[1];
            blockType = `MCQ${optionCount}`;
          } else if (blockType === 'tfOptions') {
            blockType = 'TF';
          }
          
          // 使用getQuestionFieldType获取字段类型配置
          const fieldTypeConfig = JSON_TEMPLATE_CONSTANTS.getQuestionFieldType(blockType);
          
          // 创建block名称
          // 提取具体的类型（不带数字）
          let blockPrefix = '';
          if (blockType.startsWith('MCQ')) {
            blockPrefix = 'MCQ';
          } else if (blockType === 'TF') {
            blockPrefix = 'TF';
          } else {
            blockPrefix = blockType;
          }
          
          // 使用递增的blockCounter作为区块编号
          const blockName = `${blockPrefix}Block${blockCounter++}`;
          
          // 将配置添加到模板中
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

    // 将此页的模板存储在组合模板中
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