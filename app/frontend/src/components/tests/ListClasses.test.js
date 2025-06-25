import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ListClasses from '../ListClasses';

// Mock fetch globally
global.fetch = jest.fn();

beforeEach(() => {
  fetch.mockClear();
  console.error = jest.fn(); // Mock console.error to avoid polluting test output
});

test('displays message when no classes are available', async () => {
  // Mock fetch response with no data
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [],
  });

  render(<ListClasses />);

  // Ensure the no classes message is displayed
  await waitFor(() => {
    expect(screen.getByText('No classes available')).toBeInTheDocument();
  });
});


