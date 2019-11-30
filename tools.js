import {parcelSize, colors} from './constants.js';
import {parseHtml, serializeHtml} from 'https://sync.exokit.org/html-utils.js';
import screenshot from 'https://screenshots.exokit.org/screenshot.js';

const {document: topDocument} = window.top;

const tools = Array.from(topDocument.querySelectorAll('.tool'));
const codeInput = topDocument.getElementById('code');
const detailsContentTab = topDocument.getElementById('details-content-tab');
const selectedObjectDetails = topDocument.getElementById('selected-object-details');
const avatarDetails = topDocument.getElementById('avatar-details');
const setAvatarButton = topDocument.getElementById('set-avatar-button');
const unsetAvatarButton = topDocument.getElementById('unset-avatar-button');
const settingAvatarButton = topDocument.getElementById('setting-avatar-button');
const screenshotButton = topDocument.getElementById('screenshot-button');
const screenshotImage = topDocument.getElementById('screenshot-image');
// const parcelDetails = topDocument.getElementById('parcel-details');
const parcelNameInput = topDocument.getElementById('parcel-name-input');
const saveParcelButton = topDocument.getElementById('save-parcel-button');
const editParcelButton = topDocument.getElementById('edit-parcel-button');
const stopEditingButton = topDocument.getElementById('stop-editing-button');

const toolNames = [
  'camera',
  'select',
  'move',
  'trace',
];
const floorPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localRaycaster = new THREE.Raycaster();

let toolIndex = 0;
const pixels = {};
let hoveredBoundingBoxMesh = null;
let selectedBoundingBoxMesh = null;
let hoveredXrSite = null;
let selectedXrSite = null;
let draggedXrSite = null;
let dragStartExtents = [];
let editedXrSite = null;
let extentXrSite = null;
let dirtyXrSite = null;
let floorIntersectionPoint = new THREE.Vector3(NaN, NaN, NaN);
let dragStartPoint = new THREE.Vector3(NaN, NaN, NaN);

const _getPixelKey = (x, z) => [x, z].join(':');
const _editXrSite = xrSite => {
  editedXrSite = xrSite;

  const xrSites = Array.from(document.querySelectorAll('xr-site'));
  for (let i = 0; i < xrSites.length; i++) {
    const xrSite = xrSites[i];
    if (xrSite !== editedXrSite) {
      xrSite.parentNode.removeChild(xrSite);
    }
  }

  _updateParcelButtons();
};
const _uneditXrSite = () => {
  editedXrSite = null;

  _updateParcelButtons();
};
const _updateParcelButtons = () => {
  if (editedXrSite || dirtyXrSite) {
    saveParcelButton.style.display = null;
  } else {
    saveParcelButton.style.display = null;
  }
  if (editedXrSite) {
    editParcelButton.style.display = null;
    stopEditingButton.style.display = 'none';
  } else {
    editParcelButton.style.display = 'none';
    stopEditingButton.style.display = null;
  }
}

class ToolManager extends EventTarget {
  constructor({domElement, camera, container}) {
    super();

for (let i = 0; i < tools.length; i++) {
  const tool = tools[i];
  tool.addEventListener('click', () => {
    for (let i = 0; i < tools.length; i++) {
      tools[i].classList.remove('open');
    }
    tool.classList.add('open');
    toolIndex = i;
    const toolName = toolNames[toolIndex];
    this.dispatchEvent(new MessageEvent('toolchange', {
      data: toolName,
    }));
  });
}

const _updateExtentXrSite = () => {
  const _incr = (a, b) => a - b;
  const xs = [Math.floor(dragStartPoint.x/container.scale.x/parcelSize)*parcelSize, Math.floor(floorIntersectionPoint.x/container.scale.x/parcelSize)*parcelSize].sort(_incr);
  const ys = [Math.floor(dragStartPoint.z/container.scale.z/parcelSize)*parcelSize, Math.floor(floorIntersectionPoint.z/container.scale.z/parcelSize)*parcelSize].sort(_incr);
  xs[1] += parcelSize;
  ys[1] += parcelSize;
  const pixelKeys = [];
  for (let x = xs[0]; x < xs[1]; x++) {
    for (let y = ys[0]; y < ys[1]; y++) {
      pixelKeys.push(_getPixelKey(x, y));
    }
  }
  if (pixelKeys.every(k => !pixels[k])) {
    const extents = [[
      xs[0], ys[0],
      xs[1], ys[1],
    ]];
    extentXrSite.setAttribute('extents', THREE.Land.serializeExtents(extents));
  }
};

setAvatarButton.addEventListener('click', async () => {
  const {target} = selectedBoundingBoxMesh;
  const {element} = target;
  const {src} = element;

  setAvatarButton.style.display = 'none';
  settingAvatarButton.style.display = null;

  if (src) {
    console.log('set avatar', src);
    const model = await _loadModelUrl(src);
    _setLocalModel(model);
    modelUrl = src;
    avatarDetails.classList.add('open');
  } else {
    _setLocalModel(null);
    modelUrl = null;
    avatarDetails.classList.remove('open');
  }

  _sendAllPeerConnections(JSON.stringify({
    method: 'model',
    url: modelUrl,
  }));

  setAvatarButton.style.display = null;
  settingAvatarButton.style.display = 'none';
});
unsetAvatarButton.addEventListener('click', () => {
  _setLocalModel(null);
  modelUrl = null;

  _sendAllPeerConnections(JSON.stringify({
    method: 'model',
    url: modelUrl,
  }));

  avatarDetails.classList.remove('open');
});

screenshotButton.addEventListener('click', async () => {
  const {target: {element: {bindState: {model}}}} = selectedBoundingBoxMesh;
  console.log('screenshot', model);
  if (model) {
    const blob = await screenshot(model, {
      width: 192,
      height: 192,
    });
    const url = URL.createObjectURL(blob);
    if (screenshotImage.src) {
      URL.revokeObjectURL(screenshotImage.src);
    }
    screenshotImage.src = url;
    screenshotImage.onclick = () => {
      const a = topDocument.createElement('a');
      topDocument.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = 'screenshot.png';
      a.click();
      topDocument.body.removeChild(a);
    };

    console.log('screenshot done', screenshotImage);
  }
});

saveParcelButton.addEventListener('click', async () => {
  const xrSite = dirtyXrSite || selectedXrSite;
  if (xrSite) {
    const coords = [];
    const parcelKeyIndex = {};
    const extents = THREE.Land.parseExtents(xrSite.getAttribute('extents'));
    for (let i = 0; i < extents.length; i++) {
      const extent = extents[i];
      const [x1, y1, x2, y2] = extent;
      for (let x = x1; x < x2; x += parcelSize) {
        for (let y = y1; y < y2; y += parcelSize) {
          const k =_getPixelKey(x, y);
          if (!parcelKeyIndex[k]) {
            parcelKeyIndex[k] = true;
            coords.push([x/parcelSize, y/parcelSize]);
          }
        }
      }
    }

    const name = parcelNameInput.value;
    const html = xrSite.innerHTML;
    const res = await fetch(`https://grid.exokit.org/parcels${xrSite !== dirtyXrSite ? `/${coords[0][0]}/${coords[0][1]}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        coords,
        html,
      }),
    });
    if (res.ok) {
      await res.blob();

      xrSite.setAttribute('name', name);
      const color = xrSite === selectedXrSite ? colors.select3 : colors.select;
      xrSite.baseMesh && xrSite.baseMesh.material.uniforms.uColor.value.setHex(color);
      xrSite.guardianMesh && xrSite.guardianMesh.material.uniforms.uColor.value.setHex(color);

      if (selectedXrSite === xrSite) {
        parcelNameInput.value = name;
      }
      if (dirtyXrSite === xrSite) {
        dirtyXrSite = null;
        _updateParcelButtons();
      }
    } else {
      console.warn(`invalid status code: ${res.status}`);
    }
  } else {
    console.warn('no parcel to save');
  }
});
editParcelButton.addEventListener('click', () => {
  _editXrSite(selectedXrSite);
  this.dispatchEvent(new MessageEvent('editchange'));
});
stopEditingButton.addEventListener('click', () => {
  _uneditXrSite();
  this.dispatchEvent(new MessageEvent('editchange'));
});

const _mousedown = e => {
  if (!isNaN(floorIntersectionPoint.x) && (e.buttons & 1)) {
    dragStartPoint.copy(floorIntersectionPoint);

    if (toolIndex === 3) {
      if (!dirtyXrSite) {
        const dom = parseHtml(codeInput.value);
        dom.childNodes.push(parseHtml(`<xr-site></xr-site>`).childNodes[0]);
        codeInput.value = serializeHtml(dom);
        codeInput.dispatchEvent(new CustomEvent('change'));

        const xrSites = document.querySelectorAll('xr-site');
        dirtyXrSite = xrSites[xrSites.length - 1];

        _updateParcelButtons();
      } else {
        const extents = THREE.Land.parseExtents(dirtyXrSite.getAttribute('extents'));
        for (let i = 0; i < extents.length; i++) {
          const extent = extents[i];
          const [x1, y1, x2, y2] = extent;
          for (let x = x1; x < x2; x++) {
            for (let y = y1; y < y2; y++) {
              pixels[_getPixelKey(x, y)] = false;
            }
          }
        }
        dirtyXrSite.removeAttribute('extents');
      }

      extentXrSite = dirtyXrSite;

      if (selectedXrSite) {
        selectedXrSite.baseMesh.material.uniforms.uColor.value.setHex(colors.select);
        selectedXrSite.guardianMesh.material.uniforms.uColor.value.setHex(colors.select);

        if (hoveredXrSite !== selectedXrSite) {
          hoveredXrSite = null;
        }
        if (editedXrSite !== selectedXrSite) {
          _uneditXrSite();
        }
      }

      selectedXrSite = extentXrSite;
      parcelNameInput.value = selectedXrSite.getAttribute('name');

      _updateExtentXrSite();
    } else if (toolIndex === 1) {
      dragStartPoint.copy(floorIntersectionPoint);

      const xrSites = Array.from(document.querySelectorAll('xr-site'));
      for (let i = 0; i < xrSites.length; i++) {
        const {baseMesh, guardianMesh} = xrSites[i];
        if (baseMesh) {
          baseMesh.material.uniforms.uColor.value.setHex(colors.select);
        }
        if (guardianMesh) {
          guardianMesh.material.uniforms.uColor.value.setHex(colors.select);
        }
      }
      if (hoveredXrSite) {
        const {baseMesh, guardianMesh} = hoveredXrSite;
        const color = hoveredXrSite === dirtyXrSite ? colors.select4 : colors.select3;
        if (baseMesh) {
          baseMesh.material.uniforms.uColor.value.setHex(color);
        }
        if (guardianMesh) {
          guardianMesh.material.uniforms.uColor.value.setHex(color);
        }
      }

      if (dirtyXrSite && dirtyXrSite !== hoveredXrSite) {
        const extents = THREE.Land.parseExtents(dirtyXrSite.getAttribute('extents'));
        for (let i = 0; i < extents.length; i++) {
          const extent = extents[i];
          const [x1, y1, x2, y2] = extent;
          for (let x = x1; x < x2; x++) {
            for (let y = y1; y < y2; y++) {
              pixels[_getPixelKey(x, y)] = false;
            }
          }
        }
        dirtyXrSite.parentNode.removeChild(dirtyXrSite);
        dirtyXrSite = null;
        _updateParcelButtons();
      }

      selectedXrSite = hoveredXrSite;
      parcelNameInput.value  = selectedXrSite ? selectedXrSite.getAttribute('name') : '';
      draggedXrSite = hoveredXrSite;
      dragStartExtents = hoveredXrSite ? THREE.Land.parseExtents(hoveredXrSite.getAttribute('extents')) : [];

      if (editedXrSite !== selectedXrSite) {
        _uneditXrSite();
      }
    }
  }
};
domElement.addEventListener('mousedown', _mousedown);
const _mouseup = e => {
  dragStartPoint.set(NaN, NaN, NaN);

  if (!(e.buttons & 1)) {
    if (extentXrSite) {
      const extents = THREE.Land.parseExtents(extentXrSite.getAttribute('extents'));
      for (let i = 0; i < extents.length; i++) {
        const extent = extents[i];
        const [x1, y1, x2, y2] = extent;
        for (let x = x1; x < x2; x++) {
          for (let y = y1; y < y2; y++) {
            pixels[_getPixelKey(x, y)] = true;
          }
        }
      }

      extentXrSite = null;
    }
    draggedXrSite = null;
  }
};
domElement.addEventListener('mouseup', _mouseup);
const _click = () => {
  if (selectedBoundingBoxMesh) {
    selectedBoundingBoxMesh.setSelect(false);
  }
  selectedBoundingBoxMesh = hoveredBoundingBoxMesh;
  if (selectedBoundingBoxMesh) {
    selectedBoundingBoxMesh.setSelect(true);
    selectedObjectDetails.classList.add('open');

    detailsContentTab.click();
  } else {
    selectedObjectDetails.classList.remove('open');
  }
};
domElement.addEventListener('click', _click);
const _dblclick = e => {
  if (selectedXrSite) {
    _editXrSite(selectedXrSite);
    this.dispatchEvent(new MessageEvent('editchange'));
  }
};
domElement.addEventListener('dblclick', _dblclick);

const _mousemove = e => {
  const oldHoveredXrSite = hoveredXrSite;

  hoveredBoundingBoxMesh = null;
  floorIntersectionPoint.set(NaN, NaN, NaN);
  hoveredXrSite = null;

  const rect = domElement.getBoundingClientRect();
  const xFactor = (e.clientX - rect.left) / rect.width;
  const yFactor = -(e.clientY - rect.top) / rect.height;
  localRaycaster.setFromCamera(localVector2D.set(xFactor * 2 - 1, yFactor * 2 + 1), camera);

  const _checkElementIntersections = () => {
    const intersectionCandidates = Array.from(document.querySelectorAll('xr-model')).concat(Array.from(document.querySelectorAll('xr-iframe')))
      .map(xrModel => xrModel.bindState && xrModel.bindState.model && xrModel.bindState.model.boundingBoxMesh)
      .filter(boundingBoxMesh => boundingBoxMesh);
    if (intersectionCandidates.length > 0) {
      for (let i = 0; i < intersectionCandidates.length; i++) {
        const boundingBoxMesh = intersectionCandidates[i];
        boundingBoxMesh.setHover(false);
      }
      for (let i = 0; i < intersectionCandidates.length; i++) {
        const boundingBoxMesh = intersectionCandidates[i];
        const intersections = localRaycaster.intersectObject(boundingBoxMesh);
        if (intersections.length > 0) {
          hoveredBoundingBoxMesh = boundingBoxMesh;
          hoveredBoundingBoxMesh.setHover(true);
          return true;
        }
      }
    }
    return false;
  };
  const _checkPointerIntersections = () => {
    if (toolIndex === 1) {
      const intersection = localRaycaster.ray.intersectPlane(floorPlane, localVector);
      if (intersection) {
        floorIntersectionPoint.copy(localVector);
        return true;
      }
    }
  };
  const _checkToolIntersections = () => {
    if (toolIndex === 3) {
      const intersection = localRaycaster.ray.intersectPlane(floorPlane, localVector);
      if (intersection) {
        floorIntersectionPoint.copy(localVector);
        return true;
      }
    }
    return false;
  };
  _checkElementIntersections() || _checkPointerIntersections() || _checkToolIntersections();

  if (toolIndex === 1 && !isNaN(floorIntersectionPoint.x)) {
    if (draggedXrSite) {
      const oldPixelKeys = [];
      const oldPixelKeysIndex = {};
      const oldExtents = THREE.Land.parseExtents(draggedXrSite.getAttribute('extents'));
      for (let i = 0; i < oldExtents.length; i++) {
        const extent = oldExtents[i];
        const [x1, y1, x2, y2] = extent;
        for (let x = x1; x < x2; x++) {
          for (let y = y1; y < y2; y++) {
            const k = _getPixelKey(x, y);
            oldPixelKeys.push(k);
            oldPixelKeysIndex[k] = true;
          }
        }
      }

      localVector
        .set(Math.floor(floorIntersectionPoint.x/container.scale.x/parcelSize)*parcelSize, Math.floor(floorIntersectionPoint.y/container.scale.y/parcelSize)*parcelSize, Math.floor(floorIntersectionPoint.z/container.scale.z/parcelSize)*parcelSize)
        .sub(localVector2.set(Math.floor(dragStartPoint.x/container.scale.x/parcelSize)*parcelSize, Math.floor(dragStartPoint.y/container.scale.y/parcelSize)*parcelSize, Math.floor(dragStartPoint.z/container.scale.z/parcelSize)*parcelSize));
      const dx = localVector.x;
      const dy = localVector.z;
      const newExtents = dragStartExtents.map(([x1, y1, x2, y2]) => [x1 + dx, y1 + dy, x2 + dx, y2 + dy]);

      const newPixelKeys = [];
      for (let i = 0; i < newExtents.length; i++) {
        const extent = newExtents[i];
        const [x1, y1, x2, y2] = extent;
        for (let x = x1; x < x2; x++) {
          for (let y = y1; y < y2; y++) {
            newPixelKeys.push(_getPixelKey(x, y));
          }
        }
      }
      if (newPixelKeys.every(k => !pixels[k] || oldPixelKeysIndex[k])) {
        draggedXrSite.setAttribute('extents', THREE.Land.serializeExtents(newExtents));

        for (let i = 0; i < oldPixelKeys.length; i++) {
          pixels[oldPixelKeys[i]] = false;
        }
        for (let i = 0; i < newPixelKeys.length; i++) {
          pixels[newPixelKeys[i]] = true;
        }
      }

      // XXX add parcel remove support
    } else {
      const x = floorIntersectionPoint.x/container.scale.x;
      const y = floorIntersectionPoint.z/container.scale.z;
      const xrSites = Array.from(document.querySelectorAll('xr-site'));
      for (let i = 0; i < xrSites.length; i++) {
        const xrSite = xrSites[i];
        const extents = THREE.Land.parseExtents(xrSite.getAttribute('extents'));
        if (extents.some(([x1, y1, x2, y2]) => x >= x1 && x < x2 && y >= y1 && y < y2)) {
          hoveredXrSite = xrSite;
        }
      }
    }
  } else if (toolIndex === 3 && extentXrSite && !isNaN(floorIntersectionPoint.x) && (e.buttons & 1)) {
    _updateExtentXrSite();
  }
};
domElement.addEventListener('mousemove', _mousemove);

  }
  selectTool(i) {
    tools[i].click();
  }
  getSelectedToolName() {
    return toolNames[toolIndex];
  }
  getSelectedElement() {
    return selectedXrSite;
  }
  getEditedElement() {
    return editedXrSite;
  }
  getDirtyElement() {
    return dirtyXrSite;
  }
  clampPositionToElementExtent(position, xrSite) {
    const extents = THREE.Land.parseExtents(xrSite.getAttribute('extents'));
    for (let i = 0; i < extents.length; i++) {
      const [x1, y1, x2, y2] = extents[i];
      position.x = Math.min(Math.max(position.x, x1), x2);
      position.z = Math.min(Math.max(position.z, y1), y2);
    }
  }
  deselect() {
    // XXX finish this
  }
  delete() {
    if (selectedBoundingBoxMesh) {
      const {target} = selectedBoundingBoxMesh;
      const {element} = target;
      element.parentNode.removeChild(element);
      selectedBoundingBoxMesh = null;
      selectedObjectDetails.classList.remove('open');
    } else if (selectedXrSite) {
      const extents = THREE.Land.parseExtents(selectedXrSite.getAttribute('extents'));
      for (let i = 0; i < extents.length; i++) {
        const extent = extents[i];
        const [x1, y1, x2, y2] = extent;
        for (let x = x1; x < x2; x++) {
          for (let y = y1; y < y2; y++) {
            pixels[_getPixelKey(x, y)] = false;
          }
        }
      }

      selectedXrSite.parentNode.removeChild(selectedXrSite);
      if (hoveredXrSite === selectedXrSite) {
        hoveredXrSite = null;
      }
      if (dirtyXrSite === selectedXrSite) {
        dirtyXrSite = null;
      }
      if (editedXrSite === selectedXrSite) {
        _uneditXrSite();
        this.dispatchEvent(new MessageEvent('editchange'));
      }
      selectedXrSite = null;
      parcelNameInput.value = '';
      _updateParcelButtons();

      // XXX add land parcel delete support
    }
  }
  escape() {
    if (editedXrSite) {
      _uneditXrSite();
      this.dispatchEvent(new MessageEvent('editchange'));
    }
  }
}

export {
  ToolManager,
};