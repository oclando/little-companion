(() => {
  class SpinePetRenderer {
    constructor(canvas, asset) {
      this.canvas = canvas;
      this.asset = asset;
      this.destroyed = false;
      this.frame = 0;
      this.lastFrameTime = performance.now() / 1000;
      this.mvp = new spine.webgl.Matrix4();
    }

    async initialize() {
      const config = { alpha: true, premultipliedAlpha: false, antialias: true };
      this.gl = this.canvas.getContext('webgl', config) || this.canvas.getContext('experimental-webgl', config);
      if (!this.gl) throw new Error('当前设备无法创建 WebGL 画布');

      const textureImages = await Promise.all(Object.entries(this.asset.textures || {}).map(async ([name, source]) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        return [name, image];
      }));
      if (this.destroyed) return;

      const textures = Object.fromEntries(textureImages.map(([name, image]) => [name, new spine.webgl.GLTexture(this.gl, image, false)]));
      this.atlas = new spine.TextureAtlas(this.asset.atlas, name => textures[name] || textures[name.replace(/^.*[\\/]/, '')]);
      const atlasLoader = new spine.AtlasAttachmentLoader(this.atlas);
      const skeletonJson = new spine.SkeletonJson(atlasLoader);
      const skeletonData = skeletonJson.readSkeletonData(this.asset.skeleton);
      this.skeleton = new spine.Skeleton(skeletonData);
      this.skeleton.setToSetupPose();
      this.skeleton.updateWorldTransform();

      const offset = new spine.Vector2();
      const size = new spine.Vector2();
      this.skeleton.getBounds(offset, size, []);
      this.bounds = { offset, size };

      const stateData = new spine.AnimationStateData(skeletonData);
      this.state = new spine.AnimationState(stateData);
      if (this.asset.animation) this.state.setAnimation(0, this.asset.animation, true);

      this.shader = spine.webgl.Shader.newTwoColoredTextured(this.gl);
      this.batcher = new spine.webgl.PolygonBatcher(this.gl);
      this.renderer = new spine.webgl.SkeletonRenderer(this.gl);
      this.renderer.premultipliedAlpha = this.asset.premultipliedAlpha !== false;
      this.frame = requestAnimationFrame(time => this.render(time));
    }

    resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }

      const bounds = this.bounds;
      const centerX = bounds.offset.x + bounds.size.x / 2;
      const centerY = bounds.offset.y + bounds.size.y / 2;
      const scaleX = bounds.size.x / width;
      const scaleY = bounds.size.y / height;
      const scale = Math.max(scaleX, scaleY, 0.0001) * 1.16;
      const worldWidth = width * scale;
      const worldHeight = height * scale;
      this.mvp.ortho2d(centerX - worldWidth / 2, centerY - worldHeight / 2, worldWidth, worldHeight);
      this.gl.viewport(0, 0, width, height);
    }

    render(timestamp) {
      if (this.destroyed) return;
      const now = timestamp / 1000;
      const delta = Math.min(0.1, Math.max(0, now - this.lastFrameTime));
      this.lastFrameTime = now;
      this.resize();

      const gl = this.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.state.update(delta);
      this.state.apply(this.skeleton);
      this.skeleton.updateWorldTransform();

      this.shader.bind();
      this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
      this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);
      this.batcher.begin(this.shader);
      this.renderer.draw(this.batcher, this.skeleton);
      this.batcher.end();
      this.shader.unbind();
      this.frame = requestAnimationFrame(time => this.render(time));
    }

    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.frame);
      try { this.atlas?.dispose(); } catch { /* 已经释放 */ }
      try { this.batcher?.dispose(); } catch { /* 已经释放 */ }
      try { this.shader?.dispose(); } catch { /* 已经释放 */ }
    }
  }

  window.SpinePetRenderer = SpinePetRenderer;
})();
