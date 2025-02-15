import { initContract } from '@ts-rest/core';
import {
  nestControllerContract,
  NestControllerInterface,
  NestRequestShapes,
  NestResponseShapes,
} from './ts-rest-nest';
import { TsRest } from './ts-rest.decorator';
import { TsRestRequest } from './ts-rest-request.decorator';
import { Controller, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as supertest from 'supertest';
import { z } from 'zod';

const c = initContract();
const postsRouter = c.router({
  getPost: {
    method: 'GET',
    path: `/posts/:id`,
    responses: {
      200: null,
    },
  },
});

it('allows unknown statuses when not in strict mode', () => {
  const cLoose = c.router({ posts: postsRouter });
  const nestContract = nestControllerContract(cLoose.posts);
  type RequestShapes = NestRequestShapes<typeof nestContract>;
  type ResponseShapes = NestResponseShapes<typeof nestContract>;

  const responseTypeCheck: Awaited<ResponseShapes['getPost']> = {
    status: 419,
    body: 'invalid status and response',
  };
  class PostController implements NestControllerInterface<typeof nestContract> {
    @TsRest(nestContract.getPost)
    async getPost(
      @TsRestRequest() { params: { id } }: RequestShapes['getPost']
    ) {
      return { status: 201 as const, body: null };
    }
  }
});

it('does not allow unknown statuses when in strict mode', () => {
  const cStrict = c.router({ posts: postsRouter }, { strictStatusCodes: true });
  const nestContract = nestControllerContract(cStrict.posts);
  type contractType = typeof nestContract;
  type RequestShapes = NestRequestShapes<contractType>;
  type ResponseShapes = NestResponseShapes<typeof nestContract>;

  const responseTypeCheck: Awaited<ResponseShapes['getPost']> = {
    // @ts-expect-error 419 is not defined as a known response
    status: 419,
    // @ts-expect-error 419 is not defined as a known response
    body: 'invalid status and response',
  };

  class PostController implements NestControllerInterface<typeof nestContract> {
    @TsRest(nestContract.getPost)
    // @ts-expect-error 201 is not defined as a known response
    async getPost(
      @TsRestRequest() { params: { id } }: RequestShapes['getPost']
    ) {
      return { status: 201 as const, body: null };
    }
  }
});

it('allows responseShapes types to be used in controller logic', () => {
  const cStrict = c.router({ posts: postsRouter }, { strictStatusCodes: true });
  const nestContract = nestControllerContract(cStrict.posts);
  type contractType = typeof nestContract;
  type RequestShapes = NestRequestShapes<contractType>;
  type ResponseShapes = NestResponseShapes<typeof nestContract>;

  class PostController implements NestControllerInterface<typeof nestContract> {
    @TsRest(nestContract.getPost)
    async getPost(
      @TsRestRequest() { params: { id } }: RequestShapes['getPost']
    ) {
      const result: ResponseShapes['getPost'] = {
        status: 200 as const,
        body: null,
      };
      return result;
    }
  }
});

describe('request validation', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  const initializeApp = async (controller: Type) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [controller],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    return app.getHttpServer();
  };

  const contract = initContract().router({
    withBody: {
      method: 'POST',
      path: `/`,
      body: z.object({
        title: z.string(),
      }),
      responses: {
        200: z.object({
          title: z.string(),
        }),
      },
    },
    withQuery: {
      method: 'GET',
      path: '/',
      query: z.object({
        id: z.string(),
      }),
      responses: {
        200: z.object({
          title: z.string(),
        }),
      },
    },
    withHeaders: {
      method: 'GET',
      path: '/admin',
      headers: z.object({
        token: z.string(),
      }),
      responses: {
        200: z.object({
          title: z.string(),
        }),
      },
    },
  });

  const nestContract = nestControllerContract(contract);
  type contractType = typeof nestContract;
  type RequestShapes = NestRequestShapes<contractType>;
  type ResponseShapes = NestResponseShapes<typeof nestContract>;

  it('should validate body without validateRequestBody param', async () => {
    @Controller()
    @TsRest({})
    class MyController {
      @TsRest(contract.withBody)
      async create(@TsRestRequest() { body }: RequestShapes['withBody']) {
        const response: ResponseShapes['withBody'] = {
          status: 200,
          body: { title: body.title },
        };

        return response;
      }
    }

    const server = await initializeApp(MyController);
    const serverResponse = await supertest(server)
      .post(contract.withBody.path)
      .send({ title: 123 });

    expect(serverResponse.status).toEqual(400);
    expect(serverResponse.body.issues.length > 0).toBeTruthy();
    expect(serverResponse.body.issues[0].code).toBe('invalid_type');
  });

  it('should validate body with validateRequestBody: true', async () => {
    @Controller()
    @TsRest({
      validateRequestBody: true,
    })
    class MyController {
      @TsRest(contract.withBody)
      async create(@TsRestRequest() { body }: RequestShapes['withBody']) {
        const response: ResponseShapes['withBody'] = {
          status: 200,
          body: { title: body.title },
        };

        return response;
      }
    }

    const server = await initializeApp(MyController);
    const serverResponse = await supertest(server)
      .post(contract.withBody.path)
      .send({ title: 123 });

    expect(serverResponse.status).toEqual(400);
    expect(serverResponse.body.issues.length > 0).toBeTruthy();
    expect(serverResponse.body.issues[0].code).toBe('invalid_type');
  });

  it('route param should override class param', async () => {
    @Controller()
    @TsRest({
      validateRequestBody: true,
    })
    class TestController {
      @TsRest(contract.withBody, {
        validateRequestBody: false,
      })
      async create(@TsRestRequest() { body }: RequestShapes['withBody']) {
        const response: ResponseShapes['withBody'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .post(contract.withBody.path)
      .send({ title: 432213 });

    expect(serverResponse.status).toEqual(200);
    expect(serverResponse.body.title).toBe('ok');
  });

  it("only method param - shouldn't validate body", async () => {
    @Controller()
    class TestController {
      @TsRest(contract.withBody, {
        validateRequestBody: false,
      })
      async create(@TsRestRequest() { body }: RequestShapes['withBody']) {
        const response: ResponseShapes['withBody'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .post(contract.withBody.path)
      .send({ title: 432213 });

    expect(serverResponse.status).toEqual(200);
    expect(serverResponse.body.title).toBe('ok');
  });

  it("shouldn't validate body", async () => {
    @Controller()
    @TsRest({
      validateRequestBody: false,
    })
    class TestController {
      @TsRest(contract.withBody)
      async create(@TsRestRequest() { body }: RequestShapes['withBody']) {
        const response: ResponseShapes['withBody'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .post(contract.withBody.path)
      .send({ title: 432213 });

    expect(serverResponse.status).toEqual(200);
    expect(serverResponse.body.title).toBe('ok');
  });

  it('should validate headers', async () => {
    @Controller()
    @TsRest({
      validateRequestHeaders: true,
    })
    class TestController {
      @TsRest(contract.withHeaders)
      async create(@TsRestRequest() { headers }: RequestShapes['withHeaders']) {
        const response: ResponseShapes['withHeaders'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .get(contract.withHeaders.path)
      .send();

    expect(serverResponse.status).toEqual(400);
    expect(serverResponse.body.issues.length > 0).toBeTruthy();
    expect(serverResponse.body.issues[0].code).toBe('invalid_type');
    expect(serverResponse.body.issues[0].path[0]).toBe('token');
  });

  it("shouldn't validate headers", async () => {
    @Controller()
    @TsRest({
      validateRequestHeaders: false,
    })
    class TestController {
      @TsRest(contract.withHeaders)
      async create(@TsRestRequest() { headers }: RequestShapes['withHeaders']) {
        const response: ResponseShapes['withHeaders'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .get(contract.withHeaders.path)
      .send();

    expect(serverResponse.status).toEqual(200);
    expect(serverResponse.body.title).toBe('ok');
  });

  it('should validate query', async () => {
    @Controller()
    @TsRest({
      validateRequestQuery: true,
    })
    class TestController {
      @TsRest(contract.withQuery)
      async create(@TsRestRequest() { headers }: RequestShapes['withQuery']) {
        const response: ResponseShapes['withQuery'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .get(contract.withQuery.path)
      .send();

    expect(serverResponse.status).toEqual(400);
    expect(serverResponse.body.issues.length > 0).toBeTruthy();
    expect(serverResponse.body.issues[0].code).toBe('invalid_type');
    expect(serverResponse.body.issues[0].path[0]).toBe('id');
  });

  it("shouldn't validate query", async () => {
    @Controller()
    @TsRest({
      validateRequestQuery: false,
    })
    class TestController {
      @TsRest(contract.withQuery)
      async create(@TsRestRequest() { headers }: RequestShapes['withQuery']) {
        const response: ResponseShapes['withQuery'] = {
          status: 200,
          body: { title: 'ok' },
        };

        return response;
      }
    }

    const server = await initializeApp(TestController);
    const serverResponse = await supertest(server)
      .get(contract.withQuery.path)
      .send();

    expect(serverResponse.status).toEqual(200);
    expect(serverResponse.body.title).toBe('ok');
  });
});

describe('ts-rest-nest', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  const initializeApp = async (controller: Type) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [controller],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    return app.getHttpServer();
  };

  it('should handle non-json response types from contract', async () => {
    const c = initContract();
    const nonJsonContract = c.router({
      postIndex: {
        method: 'POST',
        path: `/index.html`,
        body: z.object({
          echoHtml: z.string(),
        }),
        responses: {
          200: c.otherResponse({
            contentType: 'text/html',
            body: z.string().regex(/^<([a-z][a-z0-9]*)\b[^>]*>(.*?)<\/\1>$/im),
          }),
        },
      },
      getRobots: {
        method: 'GET',
        path: `/robots.txt`,
        responses: {
          200: c.otherResponse({
            contentType: 'text/plain',
            body: c.type<string>(),
          }),
        },
      },
      getCss: {
        method: 'GET',
        path: '/style.css',
        responses: {
          200: c.otherResponse({
            contentType: 'text/css',
            body: c.type<string>(),
          }),
        },
      },
    });

    @TsRest({ validateResponses: true })
    @Controller()
    class NonJsonController
      implements NestControllerInterface<typeof nonJsonContract>
    {
      @TsRest(nonJsonContract.postIndex)
      async postIndex(
        @TsRestRequest()
        {
          body: { echoHtml },
        }: NestRequestShapes<typeof nonJsonContract>['postIndex']
      ) {
        return {
          status: 200,
          body: echoHtml,
        } as const;
      }

      @TsRest(nonJsonContract.getRobots)
      async getRobots(@TsRestRequest() _: any) {
        return {
          status: 200,
          body: 'User-agent: * Disallow: /',
        } as const;
      }

      @TsRest(nonJsonContract.getCss)
      async getCss(@TsRestRequest() _: any) {
        return {
          status: 200,
          body: 'body { color: red; }',
        } as const;
      }
    }

    const server = await initializeApp(NonJsonController);

    const responseHtml = await supertest(server)
      .post('/index.html')
      .send({ echoHtml: '<h1>hello world</h1>' });
    expect(responseHtml.status).toEqual(200);
    expect(responseHtml.text).toEqual('<h1>hello world</h1>');
    expect(responseHtml.header['content-type']).toEqual(
      'text/html; charset=utf-8'
    );

    const responseHtmlFail = await supertest(server).post('/index.html').send({
      echoHtml: 'hello world',
    });
    expect(responseHtmlFail.status).toEqual(500);
    expect(responseHtmlFail.body).toEqual({
      message: 'Internal server error',
      statusCode: 500,
    });
    expect(responseHtmlFail.header['content-type']).toEqual(
      'application/json; charset=utf-8'
    );

    const responseTextPlain = await supertest(server).get('/robots.txt');
    expect(responseTextPlain.status).toEqual(200);
    expect(responseTextPlain.text).toEqual('User-agent: * Disallow: /');
    expect(responseTextPlain.header['content-type']).toEqual(
      'text/plain; charset=utf-8'
    );

    const responseCss = await supertest(server).get('/style.css');
    expect(responseCss.status).toEqual(200);
    expect(responseCss.text).toEqual('body { color: red; }');
    expect(responseCss.header['content-type']).toEqual(
      'text/css; charset=utf-8'
    );
  });
});
