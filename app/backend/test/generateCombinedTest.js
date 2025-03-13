const fs = require('fs');
const path = require('path');
const { 
  generateLatexDocument, 
  calculateQuestionDistribution,
  generateCustomJsonTemplate 
} = require('../src/utils/templateGenerator');
const { LAYOUT_PARAMS } = require('../src/utils/templateConstants');

// 创建输出目录路径
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// 确保测试输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 生成并保存LaTeX和JSON模板的函数
async function generateAndSaveCombinedTemplates(questions, options, courseId, examTitle, classId, latexFilename, jsonFilename) {
  try {
    console.log(`正在生成LaTeX和JSON模板...`);
    
    // 先计算题目分布
    const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
    
    // 确保placeQuestionAt命令总是被包含
    usedCommandTypes.add('placeQuestionAt');
    
    // 生成LaTeX文档
    console.log(`- 生成LaTeX文档...`);
    const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
    
    // 生成JSON模板
    console.log(`- 生成JSON模板...`);
    const jsonTemplate = await generateCustomJsonTemplate(questions, courseId, examTitle, classId, structuredPositions);
    
    // 完整文件路径
    const latexOutputPath = path.join(OUTPUT_DIR, latexFilename);
    const jsonOutputPath = path.join(OUTPUT_DIR, jsonFilename);
    
    // 保存到文件
    fs.writeFileSync(latexOutputPath, latexContent);
    fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonTemplate, null, 2));
    
    console.log(`LaTeX模板已生成并保存至: ${latexOutputPath}`);
    console.log(`文件大小: ${fs.statSync(latexOutputPath).size} 字节`);
    
    console.log(`JSON模板已生成并保存至: ${jsonOutputPath}`);
    console.log(`文件大小: ${fs.statSync(jsonOutputPath).size} 字节`);
    
    return { latexPath: latexOutputPath, jsonPath: jsonOutputPath };
  } catch (error) {
    console.error(`生成模板失败: ${error.message}`);
    return false;
  }
}

// 执行测试用例
async function runTests() {
  console.log('开始生成组合模板测试...');
  
  // 测试用例1: 标准试卷 (50题)
  await generateAndSaveCombinedTemplates(
    50, 
    5, 
    'MATH101', 
    '期中考试', 
    'A1', 
    'combined_standard_template.tex',
    'combined_standard_template.json'
  );
  
  // 测试用例2: 大型试卷 (150题，跨越两页)
  await generateAndSaveCombinedTemplates(
    150, 
    5, 
    'PHYS102', 
    '期末考试', 
    'B2', 
    'combined_large_template.tex',
    'combined_large_template.json'
  );
  
  // 测试用例3: 混合题型
  const mixedQuestionTypes = [
    'MCQ4',  // 4选项多选题
    'MCQ5',  // 5选项多选题
    'TF',    // 判断题
    'MCQ9',  // 宽选项多选题
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
    // 添加更多题目以测试分页
    ...Array(30).fill().map((_, i) => i % 5 === 0 ? 'TF' : 'MCQ5')
  ];
  
  await generateAndSaveCombinedTemplates(
    mixedQuestionTypes,
    null, // 不需要options参数，因为每个题目都有自己的类型
    'MULTI105',
    '混合题型测试',
    'E5',
    'combined_mixed_types_template.tex',
    'combined_mixed_types_template.json'
  );
  
  console.log('所有组合模板测试完成！');
}

// 运行所有测试
runTests().catch(error => {
  console.error('测试执行失败:', error);
}); 