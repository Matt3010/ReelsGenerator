-- the library's model column held the weights' file name; now it holds the model's id (models.ts)
UPDATE `assets` SET `model` = 'dreamshaper' WHERE `model` = 'DreamShaperXL_Turbo_v2_1';
