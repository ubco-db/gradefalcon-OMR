const fs = require('fs');
const path = require('path');
const { generateLatexDocument, calculateQuestionDistribution } = require('../src/utils/templateGenerator');
const { LAYOUT_PARAMS } = require('../src/utils/templateConstants');

// 创建输出目录路径
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// 确保测试输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 生成并保存LaTeX文档的函数
async function generateAndSaveTemplate(questions, options, courseId, examTitle, classId, filename) {
  try {
    console.log(`正在生成模板: ${filename}...`);
    
    // 先计算题目分布
    const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
    
    // 确保placeQuestionAt命令总是被包含
    usedCommandTypes.add('placeQuestionAt');
    
    // 生成LaTeX文档
    const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
    
    // 完整文件路径
    const outputPath = path.join(OUTPUT_DIR, filename);
    
    // 保存到文件
    fs.writeFileSync(outputPath, latexContent);
    
    console.log(`LaTeX模板已生成并保存至: ${outputPath}`);
    console.log(`文件大小: ${fs.statSync(outputPath).size} 字节`);
    return true;
  } catch (error) {
    console.error(`生成模板失败: ${error.message}`);
    return false;
  }
}

// 执行测试用例
async function runTests() {
  console.log('开始生成LaTeX模板测试...');
  
  // 测试用例1: 标准试卷 (50题)
  await generateAndSaveTemplate(
    50, 
    5, 
    'MATH101', 
    'Midterm Exam', 
    'A1', 
    'standard_template.tex'
  );
  
  // 测试用例2: 大型试卷 (150题，跨越两页)
  await generateAndSaveTemplate(
    150, 
    5, 
    'PHYS102', 
    'Final Exam', 
    'B2', 
    'large_template.tex'
  );
  
  // 测试用例3: 不同选项数量 (4选项而非5选项)
  await generateAndSaveTemplate(
    50, 
    4, 
    'CHEM103', 
    'Quiz', 
    'C3', 
    'four_options_template.tex'
  );
  
  // 测试用例4: 横向填充排列 (测试新的排列方式)
  await generateAndSaveTemplate(
    12, 
    5, 
    'CS104', 
    'Row-first Layout (12 questions)', 
    'D4', 
    'row_first_12_template.tex'
  );
  
  // 测试用例5: 复杂选项类型混合
  // 创建一个包含不同题目类型的数组
  const mixedQuestionTypes = [
    'MCQ4',  // 4选项多选题
    'MCQ5',  // 5选项多选题
    'TF',    // 判断题
    'MCQ9',  // 宽选项多选题
    'GRID_3_4_2', // 3行4列网格，选择2项
    'MCQ5',
    'MCQ5',
    'MCQ5',
    'TF',
    'MCQ5',
    'MCQ5',
    'TF',
    'MCQ5',
    'GRID_5_7_3', // 5行7列网格，选择3项
    'MCQ9',
    'MCQ4',
    'MCQ4',
    'MCQ4',
    'MCQ4',
    'MCQ4',
    // 添加足够多的题目以测试分页
    ...Array(90).fill().map((_, i) => i % 5 === 0 ? 'TF' : 'MCQ5')
  ];
  
  await generateAndSaveTemplate(
    mixedQuestionTypes,
    null, // 不需要options参数，因为每个题目都有自己的类型
    'MULTI105',
    'Mixed Question Types',
    'E5',
    'mixed_types_template.tex'
  );
  
  console.log('所有测试完成！');
}

// 运行所有测试
runTests().catch(error => {
  console.error('测试执行失败:', error);
}); 