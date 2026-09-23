import { registerPlugin } from '@capacitor/core'

export interface GoogleDriveAuthPluginResponse {
  needsUi: boolean
  accessToken?: string
}

export interface GoogleDriveAuthPlugin {
  authorizeSilent(): Promise<GoogleDriveAuthPluginResponse>
}

export const GoogleDriveAuth = registerPlugin<GoogleDriveAuthPlugin>('GoogleDriveAuth')

