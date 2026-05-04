export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

export type AuthState =
  | { status: 'loading'; user: null; error?: string; configured: boolean }
  | { status: 'signed-out'; user: null; error?: string; configured: boolean }
  | { status: 'signed-in'; user: AuthUser; error?: string; configured: boolean }
