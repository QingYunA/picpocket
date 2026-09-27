import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  addGenerationTask,
  getGenerationTasks,
  updateGenerationTask,
  deleteGenerationTask,
  clearGenerationTasks,
} from '../index';
import type { GenerationBatchTask } from '@/types';

describe('Generation History Dexie Persistence', () => {
  beforeEach(async () => {
    if (db.generationTasks) {
      await db.generationTasks.clear();
    }
  });

  it('should persist generation batch tasks and retrieve them ordered by createdAt descending', async () => {
    const task1: GenerationBatchTask = {
      id: 'task_1',
      prompt: 'Cyberpunk street in rain, neon lighting',
      aspectRatio: '16:9',
      model: 'grok-imagine',
      images: [
        {
          id: 'img_1_1',
          dataUrl: 'data:image/png;base64,sample1',
          prompt: 'Cyberpunk street in rain, neon lighting',
          aspectRatio: '16:9',
          width: 1792,
          height: 1024,
          createdAt: 1000,
        },
      ],
      status: 'success',
      latencyMs: 1500,
      createdAt: 1000,
    };

    const task2: GenerationBatchTask = {
      id: 'task_2',
      prompt: '3D cute cat render, octane render',
      aspectRatio: '1:1',
      model: 'grok-imagine',
      images: [
        {
          id: 'img_2_1',
          dataUrl: 'data:image/png;base64,sample2',
          prompt: '3D cute cat render, octane render',
          aspectRatio: '1:1',
          width: 1024,
          height: 1024,
          createdAt: 2000,
        },
      ],
      status: 'success',
      latencyMs: 1200,
      createdAt: 2000,
    };

    await addGenerationTask(task1);
    await addGenerationTask(task2);

    const tasks = await getGenerationTasks();
    expect(tasks).toHaveLength(2);
    // Ordered descending by createdAt: task2 first
    expect(tasks[0]!.id).toBe('task_2');
    expect(tasks[1]!.id).toBe('task_1');
    expect(tasks[0]!.images[0]!.dataUrl).toBe('data:image/png;base64,sample2');
  });

  it('should update task image saved flags when saved to gallery or prompts', async () => {
    const task: GenerationBatchTask = {
      id: 'task_save_test',
      prompt: 'Minimalist architecture',
      aspectRatio: '4:3',
      model: 'grok-imagine',
      images: [
        {
          id: 'img_arch_1',
          dataUrl: 'data:image/png;base64,arch',
          prompt: 'Minimalist architecture',
          aspectRatio: '4:3',
          width: 1024,
          height: 768,
          createdAt: 3000,
          savedToGallery: false,
          savedToPrompts: false,
        },
      ],
      status: 'success',
      createdAt: 3000,
    };

    await addGenerationTask(task);

    // Update images saved status
    const targetImage = task.images[0]!;
    const updatedImages = [
      {
        ...targetImage,
        savedToGallery: true,
        savedToPrompts: true,
      },
    ];
    await updateGenerationTask('task_save_test', { images: updatedImages });

    const retrieved = await db.generationTasks.get('task_save_test');
    expect(retrieved?.images[0]?.savedToGallery).toBe(true);
    expect(retrieved?.images[0]?.savedToPrompts).toBe(true);
  });

  it('should delete a single generation task by id', async () => {
    const task: GenerationBatchTask = {
      id: 'task_to_delete',
      prompt: 'Temporary test task',
      aspectRatio: '1:1',
      model: 'test-model',
      images: [],
      status: 'success',
      createdAt: 4000,
    };

    await addGenerationTask(task);
    expect(await db.generationTasks.get('task_to_delete')).toBeDefined();

    await deleteGenerationTask('task_to_delete');
    expect(await db.generationTasks.get('task_to_delete')).toBeUndefined();
  });

  it('should clear all generation tasks', async () => {
    await addGenerationTask({
      id: 'task_a',
      prompt: 'A',
      aspectRatio: '1:1',
      model: 'm',
      images: [],
      status: 'success',
      createdAt: 1,
    });
    await addGenerationTask({
      id: 'task_b',
      prompt: 'B',
      aspectRatio: '1:1',
      model: 'm',
      images: [],
      status: 'success',
      createdAt: 2,
    });

    const beforeClear = await getGenerationTasks();
    expect(beforeClear.length).toBe(2);

    await clearGenerationTasks();
    const afterClear = await getGenerationTasks();
    expect(afterClear.length).toBe(0);
  });
});
