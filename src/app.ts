import { WebSocketManager } from './services/websocketManager';
import { 
  LP_ACCOUNT_ADDRESS, 
  METEORA_DAMM_V1_PROGRAM_ID, 
  METEORA_DAMM_V2_PROGRAM_ID 
} from './config/constants';

export class MeteoraMonitorApp {
  private wsManager: WebSocketManager;

  constructor() {
    this.wsManager = new WebSocketManager();
  }

  start(): void {
    console.log('Starting METEORA Pool Transaction Monitor');
    console.log(` Target Pool: ${LP_ACCOUNT_ADDRESS}`);
    console.log(` DAMM V1 Program: ${METEORA_DAMM_V1_PROGRAM_ID}`);
    console.log(` DAMM V2 Program: ${METEORA_DAMM_V2_PROGRAM_ID}`);
    
    this.wsManager.initialize();
  }
}
