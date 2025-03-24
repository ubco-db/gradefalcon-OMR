/**
 * 模板生成器常量
 * 包含LaTeX文档生成和JSON模板生成中使用的所有常量
 */
/**
 * Template Generator Constants
 * Contains all constants used in LaTeX document generation and JSON template generation
 */

// 布局参数
// Layout parameters
const LAYOUT_PARAMS = {
  columnsPerPage: 4,     // 每页的普通列数
  rowsPerPage: 25,       // 每页的行数
  rowHeight: 0.26,       // 行高（英寸）
  colWidth: 1.7,         // 列宽（英寸）
  startX: 0.6,           // 第一列的X坐标（英寸）
  firstPageStartY: 3.8,  // 第一页第一行的Y坐标（英寸）
  otherPagesStartY: 0.8  // 其他页第一行的Y坐标（英寸）
};

// JSON模板常量 - 重组为完整模板片段
// JSON template constants - Restructured as complete template fragments
const JSON_TEMPLATE_CONSTANTS = {
  
  // 每页基础模板结构
  // Base template structure for each page
  basePageTemplate: {
      templateDimensions: [1095, 1485],
      bubbleDimensions: [23, 23]
    },
  
  // 学生ID区域模板（仅用于第一页）
  // Student ID area template (first page only)
  studentIdSection: {
    customBubbleFieldTypes: {
      CUSTOM_ID: {
        bubbleValues: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
        direction: "horizontal",
      }
    },
    customLabels: {
      StudentID: ["roll1..8"]
    },
    fieldBlock: {
        fieldDetectionType: "BUBBLES_THRESHOLD",
        bubbleFieldType: "CUSTOM_ID",
        origin: [343, 167],
        fieldLabels: ["roll1..8"],
        bubblesGap: 47.2,
        labelsGap: 36.5
    }
  },
  
  //customBubbleFieldTypes
  presetCustomBubbleFieldTypes: {
    CUSTOM_TF: {
      bubbleValues: ["T", "F"],
      direction: "horizontal",
    },
    CUSTOM_WIDE: {
      bubbleValues: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      direction: "horizontal",
    }
  },

  // 问题类型配置
  // Question type configuration
  questionFieldTypes: {

  },
  
  // 字段类型映射字典
  // Field type mapping dictionary
  fieldTypeMapping: {
    MCQ4: "QTYPE_MCQ4",
    MCQ5: "QTYPE_MCQ5",
    TF: "CUSTOM_TF",
    GRID: "CUSTOM_GRID",
    MCQ10: "CUSTOM_WIDE",
    // 可以根据需要添加更多映射
    // Can add more mappings as needed
  },
  
  getQuestionFieldType: function(inputType) {
    // 检查是否需要转换输入类型
    // Check if input type needs conversion
    const bubbleFieldType = this.fieldTypeMapping[inputType] || inputType;
    
    return {
      fieldDetectionType: "BUBBLES_THRESHOLD",
      bubbleFieldType: bubbleFieldType,
      bubblesGap: 30,
      labelsGap: 39
    };
  },
  
  // 生成问题区域配置的辅助函数
  // Helper function for generating question area configuration
  getQuestionFieldBlock: function(type, questionNumber, options, coordinates) {
    const questionType = this.questionTypes[type];
    const label = `q${questionNumber}`;
    
    return {
      fieldDetectionType: questionType.fieldDetectionType,
      bubbleFieldType: type === 'MCQ' 
        ? questionType.getBubbleFieldType(options)
        : questionType.bubbleFieldType,
      origin: [coordinates.x, coordinates.y],
      fieldLabels: [label],
      bubblesGap: type === 'MCQ'
        ? questionType.getBubblesGap(options)
        : questionType.bubblesGap,
      labelsGap: questionType.labelsGap
    };
  }
};

// LaTeX命令常量
// LaTeX command constants
const LATEX_COMMANDS = {
  // 定义圆圈命令用于学生ID部分
  // Define circle command for student ID section
  circleCommand: `
    \\newcommand*\\cir[1]{\\tikz[baseline=(char.base)]{
      \\node[shape=circle,draw,inner sep=0.02in] (char) {\\scriptsize #1};}}
    
    \\usepackage{array}
    \\usepackage{multirow}
    \\usepackage{xfp}
  `,

  // MCQ类型 - 标准多选题
  // MCQ type - Standard multiple choice
  mcqOptionsCommand: `
    % MCQ类型 - 标准多选题
    % MCQ type - Standard multiple choice
    \\newcommand{\\mcqOptions}[2]{%
      % 参数1: 选项数量, 参数2: 题号
      % Parameter 1: Number of options, Parameter 2: Question number
      \\begin{minipage}{1.7in}%
        \\makebox[0.5in][r]{\\textbf{#2}}\\hspace{0.1in}
        \\begin{tikzpicture}[baseline=-0.5ex, scale=1]%
          \\foreach \\i in {1,...,#1} {%
            \\ifcase\\i\\or\\def\\optletter{A}\\or\\def\\optletter{B}\\or\\def\\optletter{C}\\or\\def\\optletter{D}\\or\\def\\optletter{E}\\or\\def\\optletter{F}\\or\\def\\optletter{G}\\or\\def\\optletter{H}\\or\\def\\optletter{I}\\or\\def\\optletter{J}\\fi%
            \\node at (\\i*0.5,0) {\\scriptsize \\optletter};%
            \\draw (\\i*0.5,0) circle (0.18);%
          }%
        \\end{tikzpicture}%
      \\end{minipage}%
    }
  `,
  
  // 简单的True/False选项
  // Simple True/False options
  tfOptionsCommand: `
    % 简单的True/False选项
    % Simple True/False options
    \\newcommand{\\tfOptions}[1]{%
      % 参数1: 题号
      % Parameter 1: Question number
      \\begin{minipage}{1.7in}%
        \\makebox[0.5in][r]{\\textbf{#1}}\\hspace{0.1in}
        \\begin{tikzpicture}[baseline=-0.5ex, scale=1]%
          \\node at (0.5,0) {\\scriptsize T};%
          \\draw (0.5,0) circle (0.18);%
          \\node at (1.0,0) {\\scriptsize F};%
          \\draw (1.0,0) circle (0.18);%
        \\end{tikzpicture}%
      \\end{minipage}%
    }
  `,
  
  // 网格选项类型 - 支持多行多列的网格布局
  // Grid option type - Supports multi-row multi-column grid layout
  gridOptionsCommand: `
    % 网格选项类型 - 支持多行多列的网格布局
    % Grid option type - Supports multi-row multi-column grid layout
    \\newcommand{\\gridOptions}[4]{%
      % 参数1: 行数, 参数2: 列数, 参数3: 选择数量, 参数4: 题号
      % Parameter 1: Number of rows, Parameter 2: Number of columns, Parameter 3: Number of selections, Parameter 4: Question number
      \\begin{minipage}{3in}%
        \\makebox[0.5in][r]{\\textbf{#4}}\\hspace{0.1in}
        \\begin{tikzpicture}[baseline=-0.5ex, scale=0.8]%
          \\foreach \\row in {1,...,#1} {%
            \\foreach \\col in {1,...,#2} {%
              \\pgfmathtruncatemacro{\\idx}{(\\row-1)*#2 + \\col}%
              \\pgfmathtruncatemacro{\\letter}{\\idx+64}% ASCII A=65
              \\node at (\\col*0.5, -\\row*0.5) {\\scriptsize \\char\\letter};%
              \\draw (\\col*0.5, -\\row*0.5) circle (0.18);%
            }%
          }%
        \\end{tikzpicture}%
      \\end{minipage}%
    }
  `,
  
  // 宽型多选题 - 占用整行
  // Wide multiple choice - Takes up the entire row
  wideOptionsCommand: `
    % 宽型多选题 - 占用整行
    % Wide multiple choice - Takes up the entire row
    \\newcommand{\\wideOptions}[2]{%
      % 参数1: 选项数量, 参数2: 题号
      % Parameter 1: Number of options, Parameter 2: Question number
      \\begin{minipage}{7in}%
        \\makebox[0.5in][r]{\\textbf{#2}}\\hspace{0.1in}
        \\begin{tikzpicture}[baseline=-0.5ex, scale=1]%
          \\foreach \\i in {1,...,#1} {%
            \\ifcase\\i\\or\\def\\optletter{A}\\or\\def\\optletter{B}\\or\\def\\optletter{C}\\or\\def\\optletter{D}\\or\\def\\optletter{E}\\or\\def\\optletter{F}\\or\\def\\optletter{G}\\or\\def\\optletter{H}\\or\\def\\optletter{I}\\or\\def\\optletter{J}\\fi%
            \\node at (\\i*0.7,0) {\\scriptsize \\optletter};%
            \\draw (\\i*0.7,0) circle (0.18);%
          }%
        \\end{tikzpicture}%
      \\end{minipage}%
    }
  `,
  
  // 定义新的选项放置命令
  // Define new option placement command
  placeQuestionAtCommand: `
    % 定义新的选项放置命令
    % Define new option placement command
    % 参数: 页码, 坐标x, 坐标y, 选项命令
    % Parameters: Page number, X coordinate, Y coordinate, Option command
    \\newcommand{\\placeQuestionAt}[4]{%
      % 只在相应页面放置选项
      % Only place options on the corresponding page
      \\ifnum\\value{page}=#1%
        \\AtPageUpperLeft{%
          \\put(#2 in, -#3 in){%
            #4%
          }%
        }%
      \\fi%
    }
  `,

  // 定义角标QR码
  // Define corner QR codes
  cornerMarkersCode: `
    % Add corner markers to every page with page-specific content
    \\AddToShipoutPictureBG{%
      \\ifnum\\value{page}=1
        % First page QR codes (1,2,3,4)
        % Top-left corner
        \\AtPageUpperLeft{%
          \\put(0.3in,-0.4in){%
            \\qrcode[height=0.3in,version=1]{1}%
          }%
        }%
        
        % Top-right corner
        \\AtPageUpperLeft{%
          \\put(7.9in,-0.4in){%
            \\qrcode[height=0.3in,version=1]{2}%
          }%
        }%
        
        % Bottom-right corner
        \\AtPageLowerLeft{%
          \\put(7.9in,0.4in){%
            \\qrcode[height=0.3in,version=1]{3}%
          }%
        }%
        
        % Bottom-left corner
        \\AtPageLowerLeft{%
          \\put(0.3in,0.4in){%
            \\qrcode[height=0.3in,version=1]{4}%
          }%
        }%
      \\else
        % Second page and beyond QR codes (5,6,7,8)
        % Top-left corner
        \\AtPageUpperLeft{%
          \\put(0.3in,-0.4in){%
            \\qrcode[height=0.3in,version=1]{5}%
          }%
        }%
        
        % Top-right corner
        \\AtPageUpperLeft{%
          \\put(7.9in,-0.4in){%
            \\qrcode[height=0.3in,version=1]{6}%
          }%
        }%
        
        % Bottom-right corner
        \\AtPageLowerLeft{%
          \\put(7.9in,0.4in){%
            \\qrcode[height=0.3in,version=1]{7}%
          }%
        }%
        
        % Bottom-left corner
        \\AtPageLowerLeft{%
          \\put(0.3in,0.4in){%
            \\qrcode[height=0.3in,version=1]{8}%
          }%
        }%
      \\fi
    }%
  `,

  // 学生ID区域模板 - 需要动态插入元数据
  // Student ID area template - Requires dynamic insertion of metadata
  studentIdCodeTemplate: `
    % Place student ID area at specific position on first page
    \\AddToShipoutPictureBG{%
      \\ifnum\\value{page}=1
        \\AtPageUpperLeft{%
          \\put(0in,-2.5in){%
            \\begin{minipage}{8.5in}%
              \\begin{center}
              \\begin{tabular}{p{0.8in} p{0.2in} c c c c c c c c c c}
                \\multirow{9}{*}{\\centering\\textbf{Student I.D.}} & & 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 \\\\[0.04in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\[0.08in]
                & \\rule{0.2in}{0.5pt} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} \\\\
              \\end{tabular}
              \\hspace{5mm}
              \\qrcode[height=0.8in,level=H]{METADATA_PLACEHOLDER}
              \\end{center}
            \\end{minipage}%
          }%
        }%
      \\fi
    }%
  `,

  // LaTeX文档头部模板
  // LaTeX document header template
  documentHeaderTemplate: `
    \\documentclass{article}
    \\usepackage[utf8]{inputenc}
    \\usepackage{helvet}
    \\usepackage{qrcode}
    \\renewcommand{\\familydefault}{\\sfdefault}
    \\usepackage{tikz}
    \\usepackage[letterpaper, margin=0.75in, top=0.6in, bottom=0.6in]{geometry}
    \\usepackage{pgffor}
    \\usepackage{graphicx}
    \\usepackage{eso-pic}
    \\usepackage{ifthen}
  `
};

module.exports = {
  LAYOUT_PARAMS,
  JSON_TEMPLATE_CONSTANTS,
  LATEX_COMMANDS
}; 