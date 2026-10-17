import { NativeModule, requireNativeModule } from 'expo';

import { StartOptions, TickMicModuleEvents } from './TickMic.types';

declare class TickMicModule extends NativeModule<TickMicModuleEvents> {
  getPermissionStatus(): 'granted' | 'denied' | 'undetermined';
  requestPermission(): Promise<boolean>;
  /** Starts capture; resolves with the actual hardware sample rate. */
  start(options: StartOptions): Promise<number>;
  stop(): void;
}

export default requireNativeModule<TickMicModule>('TickMic');
