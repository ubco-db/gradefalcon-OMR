const fs = require('fs');
const path = require('path');
const { generateLatexDocument, calculateQuestionDistribution, generateCustomJsonTemplate } = require('../src/utils/templateGenerator');
const { LAYOUT_PARAMS } = require('../src/utils/templateConstants');
const chai = require('chai'); 
const expect = chai.expect;

// 创建输出目录路径
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// 确保测试输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

describe('templateGenerator.js', () => {
  describe('generateLatexDocument', () => {
    // 测试用例：生成标准试卷模板
    it('should generate a LaTeX document with standard parameters', async () => {
      // 测试参数
      const questions = 50;
      const options = 5;
      const courseId = 'MATH101';
      const examTitle = 'Midterm Exam';
      const classId = 'A1';
      
      // 文件路径
      const outputPath = path.join(OUTPUT_DIR, 'standard_template.tex');

      // 先计算题目分布
      const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
      
      // 确保placeQuestionAt命令总是被包含
      usedCommandTypes.add('placeQuestionAt');
      
      // 生成LaTeX文档
      const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
      
      // 保存到文件
      fs.writeFileSync(outputPath, latexContent);
      
      // 验证文件已创建且内容不为空
      expect(fs.existsSync(outputPath)).to.be.true;
      expect(fs.statSync(outputPath).size).to.be.greaterThan(0);
      
      // 简单验证内容包含预期的元素
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).to.include('\\documentclass{article}');
      expect(content).to.include(`\\Large{\\textbf{${courseId}: ${examTitle}}}`);
      expect(content).to.include('\\placeQuestion');
      
      console.log(`LaTeX template generated at: ${outputPath}`);
    });

    // 测试用例：生成大型试卷模板（多页）
    it('should generate a multi-page LaTeX document for many questions', async () => {
      // 测试参数
      const questions = 150; // 需要跨越两页
      const options = 5;
      const courseId = 'PHYS102';
      const examTitle = 'Final Exam';
      const classId = 'B2';
      
      // 文件路径
      const outputPath = path.join(OUTPUT_DIR, 'large_template.tex');

      // 先计算题目分布
      const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
      
      // 确保placeQuestionAt命令总是被包含
      usedCommandTypes.add('placeQuestionAt');
      
      // 生成LaTeX文档
      const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
      
      // 保存到文件
      fs.writeFileSync(outputPath, latexContent);
      
      // 验证文件已创建且内容不为空
      expect(fs.existsSync(outputPath)).to.be.true;
      expect(fs.statSync(outputPath).size).to.be.greaterThan(0);
      
      // 验证包含了多页处理
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).to.include('\\newpage');
      expect(content).to.include('continued');
      
      console.log(`Multi-page LaTeX template generated at: ${outputPath}`);
    });
  });
  
  // 新增测试：同时生成LaTeX和JSON模板
  describe('同时生成LaTeX和JSON模板', () => {
    it('should generate both LaTeX and JSON templates with the same input', async () => {
      // 测试参数
      const questions = 80;
      const options = 5;
      const courseId = 'CS202';
      const examTitle = '期中测试';
      const classId = 'D3';
      
      // 文件路径
      const latexOutputPath = path.join(OUTPUT_DIR, 'combined_test_latex.tex');
      const jsonOutputPath = path.join(OUTPUT_DIR, 'combined_test_template.json');

      // 先计算题目分布
      const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(questions, options, LAYOUT_PARAMS);
      
      // 确保placeQuestionAt命令总是被包含
      usedCommandTypes.add('placeQuestionAt');
      
      // 生成LaTeX文档
      const latexContent = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
      
      // 生成JSON模板
      const jsonTemplate = await generateCustomJsonTemplate(questions, courseId, examTitle, classId, structuredPositions);
      
      // 保存到文件
      fs.writeFileSync(latexOutputPath, latexContent);
      fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonTemplate, null, 2));
      
      // 验证LaTeX文件已创建且内容不为空
      expect(fs.existsSync(latexOutputPath)).to.be.true;
      expect(fs.statSync(latexOutputPath).size).to.be.greaterThan(0);
      
      // 验证JSON文件已创建且内容不为空
      expect(fs.existsSync(jsonOutputPath)).to.be.true;
      expect(fs.statSync(jsonOutputPath).size).to.be.greaterThan(0);
      
      // 验证LaTeX内容包含预期的元素
      const latexContentData = fs.readFileSync(latexOutputPath, 'utf-8');
      expect(latexContentData).to.include('\\documentclass{article}');
      expect(latexContentData).to.include(`\\Large{\\textbf{${courseId}: ${examTitle}}}`);
      expect(latexContentData).to.include('\\placeQuestion');
      
      // 验证JSON内容包含预期的元素
      const jsonContent = require(jsonOutputPath);
      expect(jsonContent).to.have.property('metadata');
      expect(jsonContent.metadata).to.have.property('courseId', courseId);
      expect(jsonContent.metadata).to.have.property('examTitle', examTitle);
      expect(jsonContent.metadata).to.have.property('classId', classId);
      expect(jsonContent.metadata).to.have.property('totalQuestions', questions);
      expect(jsonContent).to.have.property('pages');
      expect(jsonContent.pages).to.have.property('page_1');
      
      console.log(`同时生成LaTeX和JSON模板成功：`);
      console.log(`- LaTeX模板: ${latexOutputPath} (${fs.statSync(latexOutputPath).size} 字节)`);
      console.log(`- JSON模板: ${jsonOutputPath} (${fs.statSync(jsonOutputPath).size} 字节)`);
    });
  });
}); 