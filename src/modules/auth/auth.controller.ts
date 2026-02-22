import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '@/common/decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/database/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { TestMercadoPagoDto } from './dto/test-mercadopago.dto';
import { TestEmailDto } from './dto/test-email.dto';
import { CurrentPlant } from '@/common/decorators/current-plant.decorator';
import { Plant } from '@/database/entities/plant.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('signup')
  async signup(@CurrentPlant() plant: Plant, @Body() signupDto: SignupDto) {
    return this.authService.signup(plant, signupDto);
  }

  @Public()
  @Post('onboarding/start')
  async startOnboarding(@Body() dto: StartOnboardingDto) {
    return this.authService.startOnboarding(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('onboarding/status')
  async onboardingStatus(@CurrentUser() user: User) {
    return this.authService.getOnboardingStatus(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/complete')
  async completeOnboarding(@CurrentUser() user: User, @Body() dto: CompleteOnboardingDto) {
    return this.authService.completeOnboarding(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/test-mercadopago')
  async testMercadoPago(@CurrentUser() user: User, @Body() dto: TestMercadoPagoDto) {
    return this.authService.testMercadoPago(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/test-email')
  async testEmail(@CurrentUser() user: User, @Body() dto: TestEmailDto) {
    return this.authService.testEmail(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getUser(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plantId: user.plantId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('logout')
  async logout() {
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verify(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }
}
