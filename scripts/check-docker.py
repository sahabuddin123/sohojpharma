import subprocess

for v in ['1.48', '1.47', '1.46', '1.45', '1.44', '1.43', '1.42', '1.41', '1.40']:
    env = {'DOCKER_API_VERSION': v}
    try:
        out = subprocess.run(['docker', 'version'], capture_output=True, text=True, env=dict(subprocess.os.environ, **env), timeout=3)
        if '500' not in out.stderr and '500' not in out.stdout:
            print(f"MATCH: {v}\n{out.stdout}")
            break
        else:
            print(f"FAILED {v}")
    except Exception as e:
        print(f"ERR {v}: {e}")
