import { useContext } from 'react';
import { HavenContext } from '../context/HavenContext';

export function useHaven() {
  const context = useContext(HavenContext);
  if (!context) {
    throw new Error('useHaven must be used within a HavenProvider');
  }
  return context;
}