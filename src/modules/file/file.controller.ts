import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth-user.type.js';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  type StoredFileResponseInput,
  storedFileResponseSchema,
} from '../../common/schemas/stored-file.schema.js';
import {
  type CreateUploadRequest,
  createUploadRequestSchema,
} from './dto/create-upload.request.js';
import {
  type UploadTicketResponseInput,
  uploadTicketResponseSchema,
} from './dto/upload-ticket.response.js';
import { FILE_THROTTLE_LIMIT, FILE_THROTTLE_TTL_MS } from './file.constants.js';
import { FileService } from './services/file.service.js';

@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
export class FileController {
  constructor(private readonly files: FileService) {}

  @Post('uploads')
  @Throttle({
    default: { ttl: FILE_THROTTLE_TTL_MS, limit: FILE_THROTTLE_LIMIT },
  })
  @SerializeOptions({ schema: uploadTicketResponseSchema })
  @ApiCreatedResponse({ standardSchema: uploadTicketResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createUploadRequestSchema }) dto: CreateUploadRequest,
  ): Promise<UploadTicketResponseInput> {
    return this.files.createUpload({ ...dto, actor: user });
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: storedFileResponseSchema })
  @ApiOkResponse({ standardSchema: storedFileResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  completeUpload(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<StoredFileResponseInput> {
    return this.files.complete({ fileId: id, actorId: userId });
  }
}
