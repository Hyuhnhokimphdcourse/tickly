import { registerWebModule, NativeModule } from 'expo';

import { TickMicModuleEvents } from './TickMic.types';

// On web the app uses getUserMedia directly (src/audio/mic.web.ts); this stub only satisfies autolinking.
class TickMicModule extends NativeModule<TickMicModuleEvents> {}

export default registerWebModule(TickMicModule, 'TickMicModule');
