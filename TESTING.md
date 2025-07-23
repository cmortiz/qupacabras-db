# Testing Guide

This project includes comprehensive testing and CI/CD automation.

## Running Tests

### All Tests
```bash
npm test              # Interactive mode
npm run test:ci       # CI mode with coverage
```

### Test Categories
- **React Components**: `src/components/__tests__/`
- **Hooks**: `src/hooks/__tests__/`
- **Utilities**: `src/__tests__/`

## Test Coverage

Current test coverage includes:
- ✅ **BenchmarkTable**: Component rendering, interactions, data display
- ✅ **SearchBar**: Input handling, search functionality
- ✅ **SortableHeader**: Sorting logic, visual indicators
- ✅ **useSortedData**: Hook functionality, sorting algorithms
- ✅ **generate-benchmark-index**: Script validation, error handling

## CI/CD Workflows

### Automated Testing (`.github/workflows/test.yml`)
- Runs on push to `main` and all pull requests
- Tests on Node.js 18.x and 20.x
- Includes linting, testing, and build verification
- Generates coverage reports

### PR Validation (`.github/workflows/pr-validation.yml`)
- Validates new benchmark submissions
- Checks JSON syntax and required fields
- Validates QASM files and numeric values
- Automatically comments on PRs with validation results

### Auto Deployment (`.github/workflows/deploy.yml`)
- Deploys to GitHub Pages on push to `main`
- Runs full test suite before deployment
- Generates and deploys optimized production build

## Writing New Tests

### Component Tests
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import YourComponent from '../YourComponent';

test('should render correctly', () => {
  render(<YourComponent {...props} />);
  expect(screen.getByText('Expected Text')).toBeInTheDocument();
});
```

### Hook Tests
```javascript
import { renderHook, act } from '@testing-library/react';
import { useYourHook } from '../useYourHook';

test('should handle state changes', () => {
  const { result } = renderHook(() => useYourHook());
  act(() => {
    result.current.someAction();
  });
  expect(result.current.someValue).toBe(expectedValue);
});
```

## Quality Standards

- **Minimum Coverage**: 80% line coverage target
- **Required Tests**: All new components and hooks must include tests
- **PR Requirements**: All tests must pass for PR approval
- **Linting**: ESLint must pass with zero warnings