import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  async getServerUsage(): Promise<string> {
    const stats = await this.appService.getServerUsage();

    // Read the HTML template
    const templatePath = path.join(__dirname, 'views', 'server-usage.html');
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders with actual values
    template = template.replace('{{CPU_USAGE}}', stats.cpu.toString());
    template = template.replace('{{RAM_USED}}', stats.ramUsed.toString());
    template = template.replace('{{RAM_TOTAL}}', stats.ramTotal.toString());
    template = template.replace('{{RAM_PERCENTAGE}}', stats.ramPercentage.toString());

    return template;
  }
}
