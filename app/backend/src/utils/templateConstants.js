/**
 * Template Generator Constants
 * Contains all constants used in LaTeX document generation and JSON template generation
 */

// Layout parameters
const LAYOUT_PARAMS = {
  columnsPerPage: 4,     // Number of standard columns per page
  rowsPerPage: 25,       // Number of rows per page
  rowHeight: 0.26,       // Row height (inches)
  colWidth: 1.7,         // Column width (inches)
  startX: 0.6,           // X coordinate of first column (inches)
  firstPageStartY: 3.8,  // Y coordinate of first row on first page (inches)
  otherPagesStartY: 0.8  // Y coordinate of first row on other pages (inches)
};

const JSON_TEMPLATE_CONSTANTS = {
  
  // Base template structure for each page
  basePageTemplate: {
      templateDimensions: [1095, 1485],
      bubbleDimensions: [23, 23]
    },
  
  // Student ID area template (only for first page)
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

  // Parsons problem area template (MVP - single section for dynamic positions)
  generateParsonsSection: function(positions = 4) {
    return {
      fieldBlocks: {
        ParsonsSection: {
          origin: [449, 679],
          labelsGap: 36.5,
          bubblesGap: 47.2,
          fieldLabels: [`pos1..${positions}`],
          bubbleFieldType: "CUSTOM_PARSONS_DIGIT",
          fieldDetectionType: "BUBBLES_THRESHOLD"
        }
      },
      bubbleDimensions: [23, 23],
      templateDimensions: [1095, 1485],
      customBubbleFieldTypes: {
        CUSTOM_PARSONS_DIGIT: {
          direction: "horizontal",
          bubbleValues: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
        }
      }
    };
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
    },
    CUSTOM_PARSONS_DIGIT: {
      bubbleValues: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      direction: "horizontal",
    }
  },

  // Question type configuration
  questionFieldTypes: {

  },
  
  // Field type mapping dictionary
  fieldTypeMapping: {
    MCQ4: "QTYPE_MCQ4",
    MCQ5: "QTYPE_MCQ5",
    TF: "CUSTOM_TF",
    GRID: "CUSTOM_GRID",
    MCQ10: "CUSTOM_WIDE",
    PARSONS: "CUSTOM_PARSONS_DIGIT",
    // More mappings can be added as needed
  },
  
  getQuestionFieldType: function(inputType) {
    // Check if input type needs conversion
    const bubbleFieldType = this.fieldTypeMapping[inputType] || inputType;
    
    return {
      fieldDetectionType: "BUBBLES_THRESHOLD",
      bubbleFieldType: bubbleFieldType,
      bubblesGap: 30,
      labelsGap: 39
    };
  },
  
  // Helper function to generate question area configuration
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

// LaTeX command constants
const LATEX_COMMANDS = {
  // Define circle command for student ID section
  circleCommand: `
    \\newcommand*\\cir[1]{\\tikz[baseline=(char.base)]{
      \\node[shape=circle,draw,inner sep=0.02in] (char) {\\scriptsize #1};}}
    
    \\usepackage{array}
    \\usepackage{multirow}
    \\usepackage{xfp}
  `,

  // MCQ type - standard multiple choice
  mcqOptionsCommand: `
    % MCQ type - standard multiple choice
    \\newcommand{\\mcqOptions}[2]{%
      % Param 1: number of options, Param 2: question number
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
  
  // Simple True/False options
  tfOptionsCommand: `
    % Simple True/False options
    \\newcommand{\\tfOptions}[1]{%
      % Param 1: question number
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
  
  // Grid options type - supports multi-row multi-column grid layout
  gridOptionsCommand: `
    % Grid options type - supports multi-row multi-column grid layout
    \\newcommand{\\gridOptions}[4]{%
      % Param 1: rows, Param 2: columns, Param 3: selection count, Param 4: question number
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
  
  // Wide type multiple choice - occupies entire row
  wideOptionsCommand: `
    % Wide type multiple choice - occupies entire row
    \\newcommand{\\wideOptions}[2]{%
      % Param 1: number of options, Param 2: question number
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

  // Parsons problem area template - dedicated section on page 2 with multi-digit support
  generateParsonsAreaTemplate: function(positions = 4) {
    const positionLabels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
                           '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th'];
    
    let tableRows = '';
    for (let i = 0; i < positions && i < 20; i++) {
      const isLast = i === positions - 1;
      const lineBreak = isLast ? '' : '\\\\[0.08in]';
      
      // Simple format: one set of 0-9 per row (MVP) with better spacing
      tableRows += `                \\textbf{${positionLabels[i]}} & \\cir{0} & \\cir{1} & \\cir{2} & \\cir{3} & \\cir{4} & \\cir{5} & \\cir{6} & \\cir{7} & \\cir{8} & \\cir{9} ${lineBreak}\n`;
    }
    
    return `
    % Place Parsons problem area as dedicated section on page 2
    \\AddToShipoutPictureBG{%
      \\ifnum\\value{page}=2
        \\AtPageUpperLeft{%
          \\put(0in,-5in){%
            \\begin{minipage}{8.5in}%
              \\begin{center}
              \\Large{\\textbf{Parsons Problem - Code Ordering}}\\\\[0.1in]
              \\small{\\textit{Fill bubbles for item numbers in order. Multi-digit: fill multiple bubbles per row.}}\\\\
              \\small{\\textit{Example: Item 15 = fill bubbles "1" and "5" in same row}}\\\\[0.2in]
              \\begin{tabular}{p{1.5in} c c c c c c c c c c}
                \\textbf{Position} & 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 \\\\[0.1in]
${tableRows}              \\end{tabular}
              \\end{center}
            \\end{minipage}%
          }%
        }%
      \\fi
    }%
  `;
  },
  
  // Define new option placement command
  placeQuestionAtCommand: `
    % Define new option placement command
    % Parameters: page number, x coordinate, y coordinate, option command
    \\newcommand{\\placeQuestionAt}[4]{%
      % Only place options on respective page
      \\ifnum\\value{page}=#1%
        \\AtPageUpperLeft{%
          \\put(#2 in, -#3 in){%
            #4%
          }%
        }%
      \\fi%
    }
  `,

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

  // Student ID area template - needs metadata dynamically inserted
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