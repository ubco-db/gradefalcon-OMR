# Testing Parsons Problem Layout

## Expected Behavior

When generating a custom bubble sheet with Parsons problems enabled:

### Page 1 Structure:
- **Header**: Course title and exam information
- **Student ID Section**: 8-digit bubble grid
- **MCQ Questions**: Regular multiple choice questions
- **Footer**: Page navigation and QR codes (1,2,3,4)

### Page 2 Structure (Dedicated Parsons Section):
- **Header**: "Parsons Problem - Code Ordering"  
- **Instructions**: 
  - "Fill in the bubble corresponding to the item number for each position."
  - "Example: If item 15 should be first, fill bubble 1 and 5 in the '1st' row."
- **Position Grid**: Dynamic number of positions (2-8) with digit bubbles 0-9
- **Footer**: QR codes (5,6,7,8)

## Testing Steps

1. Go to New Exam page
2. Select "Custom Bubble Sheet" 
3. Enable "Include Parsons Problem (Code Ordering)"
4. Set positions (e.g., 4 positions)
5. Set max score (e.g., 10 points)
6. Generate PDF

## Expected Output

- PDF will have exactly 2 pages
- Page 1: Regular MCQ layout with student ID
- Page 2: Dedicated Parsons section with clear instructions
- JSON template includes both MCQ and Parsons field definitions
- OMR processing can handle both question types

## Sample Frontend Request

```javascript
{
  "numQuestions": 20,
  "numOptions": 5, 
  "includeParsonsProblem": true,
  "parsonsPositions": 6,
  "parsonsMaxScore": 15
}
```

## Sample Backend Response

- LaTeX file with 2-page layout
- JSON template with page_1 (MCQ) and page_2 (Parsons) configurations
- OMR-ready bubble field definitions for both sections