# Engineering Open-Source Capability Map

These technologies are capability providers, not Epoch semantic authorities.

| Technology   | Epoch role                                    | Integration priority |
| ------------ | --------------------------------------------- | -------------------- |
| Babylon.js   | primary interactive world renderer            | 1                    |
| Three.js     | alternate interactive renderer                | 2                    |
| IfcOpenShell | IFC/BIM reconstruction and geometry           | 3                    |
| OCCT         | precision B-Rep / solid geometry              | 4                    |
| OpenUSD      | scene composition, layers, variants           | 5                    |
| glTF         | runtime asset delivery                        | 6                    |
| Blender      | reconstruction/asset/high-fidelity processing | 7                    |
| FreeCAD      | parametric CAD capability                     | 8                    |
| ParaView     | simulation/result visualization               | 9                    |
| CesiumJS     | site/geospatial context                       | 10                   |
| Assimp       | generic asset import normalization            | 11                   |
| Godot        | future lightweight native interactive runtime | future               |
| O3DE         | future heavy native simulation runtime        | future               |

Official upstream references:

- Babylon.js: https://www.babylonjs.com/
- Three.js: https://threejs.org/
- IfcOpenShell: https://ifcopenshell.org/
- Open CASCADE: https://dev.opencascade.org/
- OpenUSD: https://openusd.org/
- glTF: https://www.khronos.org/gltf/
- Blender: https://www.blender.org/
- FreeCAD: https://www.freecad.org/
- ParaView: https://www.paraview.org/
- CesiumJS: https://cesium.com/platform/cesiumjs/
- Assimp: https://assimp.org/
- Godot: https://godotengine.org/
- O3DE: https://o3de.org/

Selection law:

- choose a capability because it is the best fit for a clearly bounded responsibility;
- integrate behind an Epoch adapter before exposing it to the product;
- do not promote a provider/editor's project/scene/lifecycle/database into Epoch authority;
- do not add a dependency to the first visual slice unless the work order explicitly requires it.
