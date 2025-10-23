import { Injectable } from '@nestjs/common';
import * as si from 'systeminformation';

@Injectable()
export class AppService {
  async getServerUsage(): Promise<{ cpu: number; ramUsed: number; ramTotal: number; ramPercentage: number }> {
    // Get CPU load (percentage)
    const cpuLoad = await si.currentLoad();
    const cpuUsage = Math.round(cpuLoad.currentLoad);

    // Get memory info
    const memory = await si.mem();
    const ramUsed = (memory.used / 1024 / 1024 / 1024).toFixed(2); // Convert to GB
    const ramTotal = (memory.total / 1024 / 1024 / 1024).toFixed(2); // Convert to GB
    const ramPercentage = Math.round((memory.used / memory.total) * 100);

    return {
      cpu: cpuUsage,
      ramUsed: parseFloat(ramUsed),
      ramTotal: parseFloat(ramTotal),
      ramPercentage,
    };
  }
}
