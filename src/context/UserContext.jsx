import { createContext, useContext, useState, useCallback } from 'react';

const UserContext = createContext();
const STORAGE_KEY = 'tmh_user_data';

export function UserProvider({ children }) {
  const [userData, setUserData] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const saveUserData = useCallback((data) => {
    setUserData(prev => {
      const merged = { ...(prev || {}), ...data, timestamp: Date.now() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (err) {
        console.error('Failed to save user data to localStorage:', err);
      }
      return merged;
    });
  }, []);

  const hasUserData = useCallback(() => {
    return Boolean(userData?.fullName && userData?.email);
  }, [userData]);

  const clearUserData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUserData(null);
  }, []);

  return (
    <UserContext.Provider value={{ userData, saveUserData, hasUserData, clearUserData }}>
      {children}
    </UserContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- The public provider module also exposes its context hook.
export const useUser = () => useContext(UserContext);
