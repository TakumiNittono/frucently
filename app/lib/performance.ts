/**
 * パフォーマンス測定ユーティリティ
 */

export interface PerformanceMetrics {
  sttLatency?: number;
  llmTTFT?: number;
  ttsLatency?: number;
  endToEndLatency?: number;
  interruptLatency?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private timers: Map<string, number> = new Map();

  /**
   * タイマーを開始
   */
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * タイマーを停止して経過時間を記録
   */
  endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`タイマー "${name}" が見つかりません`);
      return 0;
    }

    const elapsed = performance.now() - startTime;
    this.timers.delete(name);

    // メトリクスに記録
    switch (name) {
      case 'stt':
        this.metrics.sttLatency = elapsed;
        break;
      case 'llm':
        this.metrics.llmTTFT = elapsed;
        break;
      case 'tts':
        this.metrics.ttsLatency = elapsed;
        break;
      case 'endToEnd':
        this.metrics.endToEndLatency = elapsed;
        break;
      case 'interrupt':
        this.metrics.interruptLatency = elapsed;
        break;
    }

    return elapsed;
  }

  /**
   * メトリクスを取得
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * メトリクスをリセット
   */
  reset(): void {
    this.metrics = {};
    this.timers.clear();
  }

  /**
   * メトリクスをログに出力
   */
  logMetrics(): void {
    console.log('📊 パフォーマンスメトリクス:', {
      STT遅延: this.metrics.sttLatency ? `${this.metrics.sttLatency.toFixed(0)}ms` : 'N/A',
      LLM_TTFT: this.metrics.llmTTFT ? `${this.metrics.llmTTFT.toFixed(0)}ms` : 'N/A',
      TTS遅延: this.metrics.ttsLatency ? `${this.metrics.ttsLatency.toFixed(0)}ms` : 'N/A',
      エンドツーエンド: this.metrics.endToEndLatency
        ? `${this.metrics.endToEndLatency.toFixed(0)}ms`
        : 'N/A',
      インタラプト: this.metrics.interruptLatency
        ? `${this.metrics.interruptLatency.toFixed(0)}ms`
        : 'N/A',
    });
  }
}

// シングルトンインスタンス
export const performanceMonitor = new PerformanceMonitor();

