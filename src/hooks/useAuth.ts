import { useCallback, useEffect, useState } from 'react';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  scopes: ['profile', 'email'],
});

export type AuthState = 'loading' | 'signed-in' | 'signed-out';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (GoogleSignin.hasPreviousSignIn()) {
        const user = GoogleSignin.getCurrentUser();
        setUserEmail(user?.user.email ?? null);
        setAuthState('signed-in');
      } else {
        setAuthState('signed-out');
      }
    })();
  }, []);

  const signIn = useCallback(async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type === 'success') {
        setUserEmail(response.data.user.email ?? null);
        setAuthState('signed-in');
      }
    } catch (error: any) {
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        throw error;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await GoogleSignin.signOut();
    setUserEmail(null);
    setAuthState('signed-out');
  }, []);

  return { authState, userEmail, signIn, signOut };
}
