// AI Provider Abstraction Layer
// Supports both OpenAI and Anthropic (Claude) for contract review and letter generation

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
</important_code_snippet_instructions>
*/

// <important_do_not_delete>
const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-20250514";
// </important_do_not_delete>

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json' | 'text' };
}

export interface CompletionResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  createCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<CompletionResult>;
}

// Helper: Exponential backoff delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Check if error is rate limit
function isRateLimitError(error: any): boolean {
  return error.status === 429 || 
         error.code === 'rate_limit_exceeded' ||
         error.message?.toLowerCase().includes('rate limit') ||
         error.message?.toLowerCase().includes('quota');
}

// Helper: Check if error is retryable (5xx or rate limit)
function isRetryableError(error: any): boolean {
  return isRateLimitError(error) || 
         (error.status >= 500 && error.status < 600);
}

// Helper: Retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (!isRetryableError(error) || isLastAttempt) {
        // Enhance error message with provider context
        if (isRateLimitError(error)) {
          throw new Error(
            `${providerName} rate limit exceeded. Your API key has hit its quota or rate limit. ` +
            `Please wait and try again later, or upgrade your ${providerName} plan. ` +
            `Original error: ${error.message || 'Unknown error'}`
          );
        }
        throw error;
      }

      // Calculate exponential backoff: 4s, 8s, 16s
      const waitTime = Math.pow(2, attempt + 2) * 1000;
      console.log(
        `[${providerName}] Attempt ${attempt + 1} failed (${error.status || error.code || 'unknown'}). ` +
        `Retrying in ${waitTime}ms...`
      );
      await delay(waitTime);
    }
  }

  throw new Error(`${providerName} failed after ${maxRetries} attempts`);
}

// OpenAI Provider
class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<CompletionResult> {
    return withRetry(async () => {
      const completion = await this.client.chat.completions.create({
        model: options?.model || 'gpt-4o',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }
      
      return {
        content,
        usage: {
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        }
      };
    }, 'OpenAI');
  }
}

// Anthropic/Claude Provider
class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<CompletionResult> {
    return withRetry(async () => {
      // Anthropic uses a different message format - system messages are separate
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        // Use claude-sonnet-4-20250514 as default
        model: options?.model || CLAUDE_DEFAULT_MODEL,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        system: systemMessage?.content,
        messages: conversationMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      });

      // Extract text from response
      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || !('text' in textContent)) {
        throw new Error('Anthropic returned empty or invalid response');
      }
      
      return {
        content: textContent.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    }, 'Anthropic');
  }

  // PDF extraction method - mimics web interface behavior
  async extractFromPDF(pdfBuffer: Buffer, prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<CompletionResult> {
    return withRetry(async () => {
      const response = await this.client.messages.create({
        model: CLAUDE_DEFAULT_MODEL,
        max_tokens: options?.maxTokens || 16000,
        temperature: options?.temperature ?? 0,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64')
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      });

      // Extract text from response
      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || !('text' in textContent)) {
        throw new Error('Anthropic returned empty or invalid response');
      }
      
      return {
        content: textContent.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    }, 'Anthropic');
  }
}

// Factory function to create the appropriate provider
export function createAIProvider(modelName: string): AIProvider {
  // Determine provider based on model name
  if (modelName.startsWith('claude') || modelName.startsWith('anthropic')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is not set. ' +
        'Please add your Anthropic API key to enable Claude AI models.'
      );
    }
    return new AnthropicProvider(apiKey);
  } else {
    // Default to OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
        'Please add your OpenAI API key to enable GPT models.'
      );
    }
    return new OpenAIProvider(apiKey);
  }
}

// Helper function to get the actual model string to pass to the provider
export function getModelString(modelName: string): string {
  // Map friendly names to actual model strings
  const modelMap: Record<string, string> = {
    'claude': CLAUDE_DEFAULT_MODEL,
    'claude-sonnet-4': CLAUDE_DEFAULT_MODEL,
    'gpt-4o': 'gpt-4o',
    'gpt-4': 'gpt-4',
  };

  return modelMap[modelName] || modelName;
}
