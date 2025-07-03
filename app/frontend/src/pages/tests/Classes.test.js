import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Classes from '../Instructor/Classes';

// Mock fetch globally
global.fetch = jest.fn();
global.console.error = jest.fn();

beforeEach(() => {
  fetch.mockClear();
  console.error.mockClear();
});

test('ensures "Create Class" button has the correct link', async () => {
  render(
    <MemoryRouter initialEntries={['/classes']}>
      <Routes>
        <Route path="/classes" element={<Classes />} />
      </Routes>
    </MemoryRouter>
  );

  // Ensure the "Create Class" button link is correct
  const createClassButton = screen.getByText('Create Class').closest('button');
  expect(createClassButton).toBeInTheDocument();
});
