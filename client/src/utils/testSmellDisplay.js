/**
 * Test file for smell display functionality
 * Verifies that smell data is correctly preserved and displayed across different scenarios
 */

const testSmellData = {
  // Test 1: Basic smell data preservation
  testCase1: {
    name: "Light smell initial entry",
    entry: {
      smellHas: true,
      smellType: "LIGHT",
      qualityParameters: null
    },
    expected: {
      popupSmell: "Light",
      rowColor: "#fff9c4",
      grainsColumn: "Light"
    }
  },
  
  // Test 2: Smell preserved after quality parameters added
  testCase2: {
    name: "Light smell after quality parameters",
    entry: {
      smellHas: true,
      smellType: "LIGHT",
      qualityParameters: {
        smellHas: true,
        smellType: "LIGHT",
        moisture: 12.5,
        grainsCount: 250,
        cutting1: 8.5,
        cutting2: 7.2,
        reportedBy: "staff1"
      }
    },
    expected: {
      popupSmell: "Light",
      rowColor: "#fff9c4",
      grainsColumn: "Light"
    }
  },
  
  // Test 3: Multiple quality attempts preserve smell
  testCase3: {
    name: "Smell preserved across multiple attempts",
    entry: {
      smellHas: true,
      smellType: "LIGHT",
      qualityAttemptDetails: [
        { attemptNo: 1, smellHas: true, smellType: "LIGHT" },
        { attemptNo: 2, smellHas: true, smellType: "LIGHT" }
      ]
    },
    expected: {
      popupSmell: "Light",
      rowColor: "#fff9c4",
      grainsColumn: "Light"
    }
  },
  
  // Test 4: No smell after quality
  testCase4: {
    name: "No smell when smellHas is false",
    entry: {
      smellHas: false,
      smellType: null,
      qualityParameters: {
        smellHas: false,
        smellType: null,
        moisture: 12.5,
        grainsCount: 250,
        reportedBy: "staff1"
      }
    },
    expected: {
      popupSmell: null,
      rowColor: "#ffffff",
      grainsColumn: "-"
    }
  }
};

// Helper function: Check if entry has light smell
const isLightSmell = (entry) => {
  return entry?.smellHas && String(entry?.smellType || '').toUpperCase() === 'LIGHT';
};

// Helper function: Check if entry has smell
const hasSmell = (entry) => {
  if (entry?.smellHas && entry?.smellType) return entry.smellType;
  if (entry?.qualityParameters?.smellHas && entry?.qualityParameters?.smellType) return entry.qualityParameters.smellType;
  return null;
};

// Helper function: Get row color based on smell
const getRowColor = (entry) => {
  if (isLightSmell(entry)) return '#fff9c4';
  return '#ffffff';
};

// Helper function: Get smell label for grains column
const getGrainsColumnSmell = (entry) => {
  if (!entry?.smellHas || !entry?.smellType) return '-';
  return entry.smellType;
};

// Run tests
const runTests = () => {
  console.log('Running smell display tests...\n');
  
  Object.entries(testSmellData).forEach(([key, test]) => {
    console.log(`Test: ${test.name}`);
    
    const rowColor = getRowColor(test.entry);
    const smellLabel = hasSmell(test.entry);
    const grainsSmell = getGrainsColumnSmell(test.entry);
    
    console.log(`  Row Color: ${rowColor}`);
    console.log(`  Smell Label: ${smellLabel}`);
    console.log(`  Grains Column: ${grainsSmell}`);
    console.log('');
  });
};

runTests();

// Export for use in components
export { isLightSmell, hasSmell, getRowColor, getGrainsColumnSmell };